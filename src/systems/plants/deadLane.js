// PL-197 The dead lane — A lane with all beacons dark; traffic still runs it from memory, on horns.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: A lane with all beacons dark, and traffic still runs it, from memory, on horns
//   What the player can do: Follow a local's tail through; or tow a lamp line down it and be
//   thanked in horns for a day
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via DEAD_LANE_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; locals run the lane
//   on their own course (horns only), so this plant leases nobody.
// - Cooldowns per hull key. All session state lives on `this`, never module-level.
//
// The towed lamp line is tracked through the real tether seams (towWatch): latch on
// `tether:snapCatch`, clear on `massline:releaseValidated`, live `state.player.tether` as
// authority. Plants never read invented player stamps.

import { hash32 } from '../../core/rng.js';
import { attachTowWatch, towTargetIdOf } from './towWatch.js';

export const PLANTS_DEAD_LANE_DARK_EVENT = 'plants:deadLaneDark';
export const PLANTS_DEAD_LANE_HORN_EVENT = 'plants:deadLaneHorn';
export const PLANTS_DEAD_LANE_RELIT_EVENT = 'plants:deadLaneRelit';
export const PLANTS_DEAD_LANE_THANKS_EVENT = 'plants:deadLaneThanks';

export const DEAD_LANE_TUNING = Object.freeze({
  darkDelayS: 20,            // after sector entry, the lane's lamps fail
  darkBeaconCap: 6,          // bounded beacons darkened per sector
  zoneRadiusWu: 260,         // the dark stretch's radius around its beacons
  hornCooldownS: 7,          // a local leans on the horn at most this often
  relightRadiusWu: 160,      // the towed lamp line relights dark beacons within this
  thanksHornCooldownS: 4,    // thanks horns blow this often while thanked
  thanksDayS: 120,           // "thanked in horns for a day"
  scanBudget: 40,            // entities examined per update tick (bounded walk)
  memoryCap: 32,             // bounded hull rows
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: a beacon that can go dark (real beacon, not a gate/wormhole prop).
 */
export function isDarkableBeacon(entity) {
  if (!entity || entity.alive === false || entity.type !== 'beacon' || !entity.pos) return false;
  const data = entity.data || {};
  return !data.isGate && !data.isWormhole;
}

/**
 * Decision helper (pure): is the position inside the dark stretch (near a dark beacon)?
 */
export function inDeadLaneZone(pos, darkBeacons, tuning = DEAD_LANE_TUNING) {
  if (!pos || !Array.isArray(darkBeacons)) return false;
  for (const b of darkBeacons) {
    if (!b || !b.pos) continue;
    const d = Math.hypot(finite(pos.x) - finite(b.pos.x), finite(pos.z) - finite(b.pos.z));
    if (d <= tuning.zoneRadiusWu) return true;
  }
  return false;
}

/**
 * Memory-row builder (pure): per-hull horn bookkeeping, FIFO + stale eviction at the cap.
 */
export function deadLaneRowFor(memory, hullId, now, cap = DEAD_LANE_TUNING.memoryCap) {
  if (!memory || !hullId) return null;
  let row = memory.get(hullId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > DEAD_LANE_TUNING.hornCooldownS * 6) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { lastHornAt: -Infinity, horns: 0, lastAt: now };
    memory.set(hullId, row);
  }
  return row;
}

/**
 * Standalone plant: darkens a lane's beacons, keeps the locals honking through from memory,
 * and thanks a towed lamp line in horns for a day.
 */
export const deadLanePlant = {
  name: 'plantsPl197',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._deadLaneMemory = new Map();
    this._deadLaneTowMemory = new Map();
    this._deadLaneBeacons = new Map(); // beaconId -> true while dark
    this._deadLaneDarkAt = -Infinity;
    this._deadLaneScheduled = false;
    this._deadLaneThanksUntil = -Infinity;
    this._deadLaneCursor = 0;
    if (this.bus && typeof this.bus.on === 'function') {
      this._deadLaneOff = [
        this.bus.on('sector:enter', () => this._deadLaneReset()),
        this.bus.on('sector:exit', () => this._deadLaneReset()),
        this.bus.on('save:loaded', () => this._deadLaneReset()),
      ];
    }
    attachTowWatch(this, 'deadLane', () => this._deadLaneTowMemory);
  },

  _deadLaneReset() {
    this._deadLaneMemory = new Map();
    this._deadLaneBeacons = new Map();
    this._deadLaneDarkAt = -Infinity;
    this._deadLaneScheduled = false;
    this._deadLaneThanksUntil = -Infinity;
    this._deadLaneCursor = 0;
  },

  _deadLaneTowMemoryMap() {
    if (!(this._deadLaneTowMemory instanceof Map)) this._deadLaneTowMemory = new Map();
    return this._deadLaneTowMemory;
  },

  /** The player's live tow target through the real tether seams (towWatch). */
  _deadLaneTowTargetId(now) {
    return towTargetIdOf(this.state, this._deadLaneTowMemoryMap(), now);
  },

  _deadLaneEntities() {
    const entities = this.state && this.state.entities;
    if (!entities) return [];
    const out = [];
    if (typeof entities.values === 'function') { for (const e of entities.values()) out.push(e); }
    else if (Array.isArray(entities)) { for (const e of entities) out.push(e); }
    return out;
  },

  _deadLaneDarkBeacons() {
    const out = [];
    for (const id of this._deadLaneBeacons.keys()) {
      const b = this._entityById(id);
      if (b && b.alive !== false) out.push(b);
    }
    return out;
  },

  _entityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  _darkenLane(now) {
    const sectorId = (this.state.world && this.state.world.currentSectorId) || 's';
    let darkened = 0;
    for (const ent of this._deadLaneEntities()) {
      if (darkened >= DEAD_LANE_TUNING.darkBeaconCap) break;
      if (!isDarkableBeacon(ent)) continue;
      // Deterministic subset: hash-gate each beacon against the sector seed.
      if ((hash32(sectorId, 'deadLane', String(ent.id)) & 3) !== 0) continue;
      ent.data = ent.data || {};
      ent.data.beaconDark = true;
      this._deadLaneBeacons.set(ent.id, true);
      darkened += 1;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_DEAD_LANE_DARK_EVENT, { beaconId: ent.id, t: now });
      }
    }
  },

  update() {
    if (!this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    const now = finite(this.state.simTime, 0);

    // Schedule the failure once per sector.
    if (!this._deadLaneScheduled) {
      this._deadLaneScheduled = true;
      this._deadLaneDarkAt = now + DEAD_LANE_TUNING.darkDelayS;
    }
    if (this._deadLaneBeacons.size === 0 && now >= this._deadLaneDarkAt) {
      this._darkenLane(now);
    }
    if (this._deadLaneBeacons.size === 0) return;

    const darkBeacons = this._deadLaneDarkBeacons();
    const player = this._entityById(this.state.playerId);

    // Tow a lamp line: the player's tethered target (real tether seams, towWatch) is a lit
    // beacon and the player is inside the dark stretch — relight what the lamp line passes.
    let relitAny = false;
    if (player && player.alive !== false && player.pos) {
      const towTargetId = this._deadLaneTowTargetId(now);
      const towTarget = this._entityById(towTargetId);
      const towingLamp = towTarget && towTarget.alive !== false && towTarget.type === 'beacon'
        && !(towTarget.data && towTarget.data.beaconDark === true);
      if (towingLamp && inDeadLaneZone(player.pos, darkBeacons)) {
        const relightSq = DEAD_LANE_TUNING.relightRadiusWu * DEAD_LANE_TUNING.relightRadiusWu;
        for (const [id] of this._deadLaneBeacons) {
          const b = this._entityById(id);
          if (!b || !b.pos) continue;
          const dx = b.pos.x - player.pos.x;
          const dz = b.pos.z - player.pos.z;
          if (dx * dx + dz * dz <= relightSq) {
            b.data = b.data || {};
            b.data.beaconDark = false;
            this._deadLaneBeacons.delete(id);
            relitAny = true;
            if (this.bus && typeof this.bus.emit === 'function') {
              this.bus.emit(PLANTS_DEAD_LANE_RELIT_EVENT, { beaconId: id, t: now });
            }
          }
        }
        if (relitAny) {
          this._deadLaneThanksUntil = now + DEAD_LANE_TUNING.thanksDayS;
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PLANTS_DEAD_LANE_THANKS_EVENT, { until: this._deadLaneThanksUntil, t: now });
          }
        }
      }
    }

    // Bounded hull walk: locals lean on their horns through the dark; thanks horns after a relight.
    const ents = this._deadLaneEntities();
    const budget = Math.min(DEAD_LANE_TUNING.scanBudget, ents.length);
    const thanked = now < this._deadLaneThanksUntil;
    const hornCooldown = thanked ? DEAD_LANE_TUNING.thanksHornCooldownS : DEAD_LANE_TUNING.hornCooldownS;
    for (let i = 0; i < budget; i += 1) {
      const idx = (this._deadLaneCursor + i) % ents.length;
      const ent = ents[idx];
      if (!ent || ent.alive === false || ent.type !== 'ship') continue;
      if (ent.id === this.state.playerId) continue;
      const data = ent.data || {};
      if (data.playerOwned || data.isGate || data.isWormhole) continue;
      if (!ent.pos || !inDeadLaneZone(ent.pos, darkBeacons)) continue;
      const role = String(data.trafficRole || data.role || (data.ai && data.ai.role) || '').toLowerCase();
      const isLocal = role.includes('hauler') || role.includes('freighter') || role.includes('tug')
        || role.includes('bus') || role.includes('courier') || data.jobId != null;
      if (!isLocal && !thanked) continue;
      const row = deadLaneRowFor(this._deadLaneMemory, ent.id, now);
      if (!row) continue;
      row.lastAt = now;
      if (now - row.lastHornAt < hornCooldown) continue;
      row.lastHornAt = now;
      row.horns += 1;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('audio:cue', {
          id: 'sfx_hauler_blast_lean',
          position: { x: ent.pos.x, z: ent.pos.z },
          gain: thanked ? 0.5 : 0.8,
          rate: thanked ? 1.25 : 1,
        });
        this.bus.emit(PLANTS_DEAD_LANE_HORN_EVENT, {
          hullId: ent.id,
          horns: row.horns,
          thanked,
          t: now,
        });
      }
    }
    this._deadLaneCursor = (this._deadLaneCursor + budget) % Math.max(1, ents.length);
  },

  destroy() {
    if (this._deadLaneOff) {
      for (const off of this._deadLaneOff) {
        if (typeof off === 'function') off();
      }
      this._deadLaneOff = null;
    }
  },
};
