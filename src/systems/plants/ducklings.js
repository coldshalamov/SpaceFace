// PL-144 Ducklings — Tow anything big and small skiffs tuck in behind it for the slipstream, one by one.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: Tow anything big and small skiffs tuck in behind it for the slipstream, one
//   by one
//   What the player can do: Let them ride, and one leaves a part at the far end; or shove them
//   off — they take the long way, and so, now, do you
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via DUCKLING_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; tucking in is a leased
//   follow beat, aborted when refused.
// - Cooldowns per hull key. All session state lives on `this`, never module-level.
//
// The player's tow is tracked through the real tether seams (see towWatch): latch on
// `tether:snapCatch`, clear on `massline:releaseValidated`, with the live `state.player.tether`
// read as authority. Plants never read invented player stamps.

import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { attachTowWatch, towTargetIdOf } from './towWatch.js';

export const PLANTS_DUCKLING_JOIN_EVENT = 'plants:ducklingJoin';
export const PLANTS_DUCKLING_PART_EVENT = 'plants:ducklingPart';
export const PLANTS_DUCKLING_SHOO_EVENT = 'plants:ducklingShoo';

export const DUCKLING_TUNING = Object.freeze({
  bigRadiusWu: 12,            // the tow target is "big" at or above this radius
  skiffRadiusMaxWu: 7,        // a skiff is small at or below this radius
  joinRangeWu: 220,           // skiffs within this of the tow see the slipstream
  maxDucklings: 3,            // one by one, up to three
  followDistWu: 46,           // each slot sits this far behind the tow
  slotSpreadWu: 14,           // lateral spread between slots
  followDurationS: 3,         // each leased follow beat
  rideForS: 20,               // riding this long earns the part at the far end
  partDistanceWu: 400,        // the far end: at least this much tow travel
  partRadius: 3,
  partMass: 15,
  partHull: 15,
  shoveClosingSpeedMinWu: 8, // measured pre-solve closing speed (WU/s) that shoves a duckling off
  shooDurationS: 4,
  hullCooldownS: 3,
  memoryCap: 16,              // bounded hull rows + slot book
});

export const DUCKLING_PART_LINE = 'For the tow. Thanks.';
export const DUCKLING_SHOO_LINE = 'Long way it is.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: a small civilian skiff that can tuck in.
 */
export function isDucklingSkiff(entity, rec = null, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict || data.surrendered) return false;
  if (data.ai && data.ai.pirate === true) return false;
  return finite(entity.radius, 99) <= DUCKLING_TUNING.skiffRadiusMaxWu;
}

/**
 * Memory-row builder (pure): the duckling slot book keyed by hull id, FIFO + stale eviction.
 */
export function ducklingRowFor(memory, hullId, now, cap = DUCKLING_TUNING.memoryCap) {
  if (!memory || !hullId) return null;
  let row = memory.get(hullId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || old.phase !== 'riding') memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { phase: 'none', since: -Infinity, towStartX: 0, towStartZ: 0, lastJoinAt: -Infinity, lastAt: now };
    memory.set(hullId, row);
  }
  return row;
}

export const ducklingsOps = {
  _initDucklings(ctx = {}) {
    this._ducklingMemory = new Map();
    this._ducklingTowMemory = new Map();
    if (this.bus && typeof this.bus.on === 'function' && !this._ducklingInstalled) {
      this._ducklingInstalled = true;
      this.bus.on('physics:impact', (p) => this._onDucklingImpact(p));
    }
    attachTowWatch(this, 'ducklings', () => this._ducklingTowMemory);
  },

  _ducklingMemoryMap() {
    if (!(this._ducklingMemory instanceof Map)) this._ducklingMemory = new Map();
    return this._ducklingMemory;
  },

  _ducklingTowMemoryMap() {
    if (!(this._ducklingTowMemory instanceof Map)) this._ducklingTowMemory = new Map();
    return this._ducklingTowMemory;
  },

  /** The player's live tow target through the real tether seams (towWatch). */
  _ducklingTowTargetId(state, now) {
    return towTargetIdOf(state, this._ducklingTowMemoryMap(), now);
  },

  _ducklingEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  _ducklingActive() {
    const out = [];
    for (const [hullId, row] of this._ducklingMemoryMap()) {
      if (row.phase === 'riding') out.push({ hullId, row });
    }
    return out;
  },

  _onDucklingImpact(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.causalActorId !== this.state.playerId) return;
    if (finite(payload.preSolveClosingSpeed, 0) < DUCKLING_TUNING.shoveClosingSpeedMinWu) return;
    const now = finite(this.state.simTime, 0);
    const row = this._ducklingMemoryMap().get(payload.aId) || this._ducklingMemoryMap().get(payload.bId);
    if (!row || row.phase !== 'riding') return;
    const hullId = payload.aId != null && this._ducklingMemoryMap().has(payload.aId) ? payload.aId : payload.bId;
    const hull = this._ducklingEntityById(hullId);
    row.phase = 'shooed';
    row.lastAt = now;
    // They take the long way: steer off on a wide tangent for a while.
    if (hull && hull.pos) {
      const aim = Math.atan2(finite(hull.pos.z), finite(hull.pos.x)) + Math.PI / 2;
      const owned = requestTrafficReaction(this, hull, {
        moveX: 0, moveZ: 1, boost: true, fire: false, fireGroup: null, aimAngle: aim, brake: false,
      }, DUCKLING_TUNING.shooDurationS);
      if (!owned) releaseTrafficReaction(this, hull); // refused: abort silently
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_DUCKLING_SHOO_EVENT, { hullId, t: now });
      if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
        this.helpers.voice.say({
          channel: 'bark',
          id: 'plants:pl144:shoo',
          text: DUCKLING_SHOO_LINE,
          kind: 'traffic',
          ttl: 4,
        });
      }
    }
  },

  /**
   * Per-hull hook from the traffic dispatch: skiffs tuck in behind the player's big tow, one
   * by one. Returns true while this hull is flying its slipstream slot.
   */
  _reactDucklings(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!player || player.alive === false || !player.pos) return false;
    const now = finite(state.simTime, 0);
    const memory = this._ducklingMemoryMap();

    // What is the player towing, and is it big?
    const towTargetId = this._ducklingTowTargetId(state, now);
    const towTarget = this._ducklingEntityById(towTargetId);
    const towingBig = towTarget && towTarget.alive !== false
      && finite(towTarget.radius, 0) >= DUCKLING_TUNING.bigRadiusWu;
    if (!towingBig) {
      // The tow is gone: slots peel off.
      for (const { hullId } of this._ducklingActive()) {
        const hull = this._ducklingEntityById(hullId);
        if (hull) releaseTrafficReaction(this, hull);
        memory.get(hullId).phase = 'none';
      }
      return false;
    }

    const riding = this._ducklingActive();

    // This hull already has a slot: fly the follow beat.
    if (isDucklingSkiff(e, rec, state) && memory.has(e.id)) {
      const row = memory.get(e.id);
      if (row.phase === 'riding' && now >= row.lastJoinAt) {
        row.lastAt = now;
        const slot = riding.findIndex((r) => r.hullId === e.id);
        const behind = Math.atan2(finite(player.vel.z), finite(player.vel.x)) + Math.PI;
        const lateral = (slot % 2 === 0 ? 1 : -1) * Math.floor(slot / 2 + 1) * DUCKLING_TUNING.slotSpreadWu;
        const fx = finite(player.pos.x) + Math.cos(behind) * (DUCKLING_TUNING.followDistWu + Math.floor(slot / 2) * 10) + Math.cos(behind + Math.PI / 2) * lateral;
        const fz = finite(player.pos.z) + Math.sin(behind) * (DUCKLING_TUNING.followDistWu + Math.floor(slot / 2) * 10) + Math.sin(behind + Math.PI / 2) * lateral;
        const aim = Math.atan2(fz - finite(e.pos.z), fx - finite(e.pos.x));
        const owned = requestTrafficReaction(this, e, {
          moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
        }, DUCKLING_TUNING.followDurationS);
        if (!owned) {
          row.phase = 'none';
          return false; // refused: abort, the job keeps its course
        }

        // Let them ride long enough and far enough: one leaves a part at the far end.
        const traveled = Math.hypot(finite(player.pos.x) - row.towStartX, finite(player.pos.z) - row.towStartZ);
        if (now - row.since >= DUCKLING_TUNING.rideForS && traveled >= DUCKLING_TUNING.partDistanceWu) {
          row.phase = 'parted';
          row.lastAt = now;
          releaseTrafficReaction(this, e);
          const spawnEntity = this.helpers && this.helpers.spawnEntity;
          if (typeof spawnEntity === 'function' && e.pos) {
            spawnEntity({
              type: 'cargo',
              pos: { x: finite(e.pos.x), z: finite(e.pos.z) },
              vel: { x: 0, z: 0 },
              radius: DUCKLING_TUNING.partRadius,
              mass: DUCKLING_TUNING.partMass,
              physicsBody: { mass: DUCKLING_TUNING.partMass },
              hull: DUCKLING_TUNING.partHull,
              hullMax: DUCKLING_TUNING.partHull,
              data: {
                ducklingPart: true,
                masslineTetherable: true,
                tetherable: true,
                scanLabel: 'Skiff part',
              },
            });
          }
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PLANTS_DUCKLING_PART_EVENT, { hullId: e.id, pos: { x: e.pos.x, z: e.pos.z }, t: now });
            this.bus.emit('comms:popup', {
              id: 'plants:pl144:part',
              sender: 'SKIFF',
              category: 'traffic',
              text: DUCKLING_PART_LINE,
              ttl: 5,
            });
          }
          return false;
        }
        return true;
      }
    }

    // A new skiff may tuck in, one by one, while there is room.
    if (!isDucklingSkiff(e, rec, state) || riding.length >= DUCKLING_TUNING.maxDucklings) return false;
    const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
    if (d > DUCKLING_TUNING.joinRangeWu) return false;

    const row = ducklingRowFor(memory, e.id, now);
    if (!row) return false;
    row.lastAt = now;
    if (row.phase === 'riding' || now - row.lastJoinAt < DUCKLING_TUNING.hullCooldownS) return false;

    const slot = riding.length;
    const behind = Math.atan2(finite(player.vel.z), finite(player.vel.x)) + Math.PI;
    const lateral = (slot % 2 === 0 ? 1 : -1) * Math.floor(slot / 2 + 1) * DUCKLING_TUNING.slotSpreadWu;
    const fx = finite(player.pos.x) + Math.cos(behind) * DUCKLING_TUNING.followDistWu + Math.cos(behind + Math.PI / 2) * lateral;
    const fz = finite(player.pos.z) + Math.sin(behind) * DUCKLING_TUNING.followDistWu + Math.sin(behind + Math.PI / 2) * lateral;
    const aim = Math.atan2(fz - finite(e.pos.z), fx - finite(e.pos.x));
    const owned = requestTrafficReaction(this, e, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, DUCKLING_TUNING.followDurationS);
    if (!owned) return false; // refused: abort

    row.phase = 'riding';
    row.since = now;
    row.towStartX = finite(player.pos.x);
    row.towStartZ = finite(player.pos.z);
    row.lastJoinAt = now;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_DUCKLING_JOIN_EVENT, { hullId: e.id, slot, t: now });
    }
    return true;
  },
};
