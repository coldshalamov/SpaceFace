// PL-145 Freight manners — Hold at a beacon, let three strings through, and the fourth flashes you across first.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: Hold at a beacon and let three strings through and the fourth flashes you
//   across first. Never yield, and the strings close ranks — every crossing becomes a fight you
//   started
//   What the player can do: Yield; or make an enemy of the timetable
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via FREIGHT_MANNERS_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; closing ranks is a
//   leased block beat, aborted when refused.
// - Cooldowns per string key. All session state lives on `this`, never module-level.

import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_MANNERS_YIELD_EVENT = 'plants:mannersYield';
export const PLANTS_MANNERS_FLASH_ACROSS_EVENT = 'plants:mannersFlashAcross';
export const PLANTS_MANNERS_RANKS_EVENT = 'plants:mannersRanksClosed';

export const FREIGHT_MANNERS_TUNING = Object.freeze({
  holdSpeedWu: 8,             // the player is "holding" below this speed
  crossingRadiusWu: 200,      // holding this close to a beacon is holding at a crossing
  stringRangeWu: 160,         // a string passes inside this of the holding player
  yieldCooldownS: 8,          // one counted yield per string pass
  yieldsForPriority: 3,       // let three strings through…
  crossSpeedWu: 70,           // crossing during a pass: player speed at or above this
  slightedThreshold: 1,       // never yield once and the ranks close
  blockDurationS: 3,
  hullBlockCooldownS: 5,
  leaderLampS: 1.2,           // the fourth string's leader flashes you across
  flashRepeatS: 45,           // after this long the crossing offers the flash again
  memoryCap: 24,              // bounded string + hull rows
});

export const FREIGHT_MANNERS_FLASH_LINE = 'Across you go. Quick.';
export const FREIGHT_MANNERS_RANKS_LINE = 'Close it up.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: a loaded freight hull running a string through the crossing.
 */
export function isFreightStringHull(entity, rec = null, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict) return false;
  if (data.ai && data.ai.pirate === true) return false;
  const role = String(
    (rec && rec.role)
    || data.trafficRole
    || data.role
    || (data.ai && (data.ai.role || data.ai.archetype))
    || '',
  ).toLowerCase();
  return role.includes('hauler') || role.includes('freighter') || role.includes('tanker');
}

/**
 * Decision helper (pure): is the player holding at a beacon crossing (slow, near a beacon)?
 */
export function holdingAtBeacon(player, beacons, tuning = FREIGHT_MANNERS_TUNING) {
  if (!player || !player.pos || !Array.isArray(beacons)) return null;
  const speed = Math.hypot(finite(player.vel && player.vel.x), finite(player.vel && player.vel.z));
  if (speed > tuning.holdSpeedWu) return null;
  for (const beacon of beacons) {
    if (!beacon || beacon.alive === false || !beacon.pos) continue;
    const d = Math.hypot(finite(player.pos.x) - finite(beacon.pos.x), finite(player.pos.z) - finite(beacon.pos.z));
    if (d <= tuning.crossingRadiusWu) return { beaconId: beacon.id, dist: d, speed };
  }
  return null;
}

/**
 * Memory-row builder (pure): manners bookkeeping, FIFO + stale eviction at the cap.
 */
export function mannersRowFor(memory, key, now, cap = FREIGHT_MANNERS_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > FREIGHT_MANNERS_TUNING.yieldCooldownS * 8) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      yields: 0,
      lastYieldAt: -Infinity,
      slighted: 0,
      flashedAt: -Infinity,
      lastAt: now,
    };
    memory.set(key, row);
  }
  return row;
}

export const freightMannersOps = {
  _initFreightManners(ctx = {}) {
    this._mannersMemory = new Map();
    this._mannersHulls = new Map();
    this._mannersLastScanTick = -1;
    this._mannersBeacons = [];
  },

  _mannersMemoryMap() {
    if (!(this._mannersMemory instanceof Map)) this._mannersMemory = new Map();
    return this._mannersMemory;
  },

  _mannersEntities() {
    const entities = this.state && this.state.entities;
    if (!entities) return [];
    const out = [];
    if (typeof entities.values === 'function') { for (const e of entities.values()) out.push(e); }
    else if (Array.isArray(entities)) { for (const e of entities) out.push(e); }
    return out;
  },

  /** Tick-gated beacon scan (bounded once per sim tick, not per hull). */
  _mannersScanBeacons(state) {
    const tick = Number.isInteger(state && state.tick) ? state.tick : 0;
    if (tick === this._mannersLastScanTick) return this._mannersBeacons;
    this._mannersLastScanTick = tick;
    this._mannersBeacons = this._mannersEntities().filter((e) => e && e.type === 'beacon' && e.alive !== false);
    return this._mannersBeacons;
  },

  /**
   * Per-hull hook from the traffic dispatch: yields at the crossing, the fourth string's flash
   * across, and the closed ranks when you never yield. Returns true only while this hull is
   * flying its close-ranks block beat.
   */
  _reactFreightManners(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!player || player.alive === false || !player.pos) return false;
    const now = finite(state.simTime, 0);
    const row = mannersRowFor(this._mannersMemoryMap(), 'crossing', now);
    if (!row) return false;
    row.lastAt = now;

    const beacons = this._mannersScanBeacons(state);
    const hold = holdingAtBeacon(player, beacons);
    const isString = isFreightStringHull(e, rec, state);

    // A string passes the holding player: a counted yield.
    if (hold && isString) {
      const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
      // The flash re-arms per window: past flashRepeatS the next full count flashes again.
      if (row.flashedAt >= 0 && now - row.flashedAt >= FREIGHT_MANNERS_TUNING.flashRepeatS) {
        row.flashedAt = -Infinity;
        row.yields = 0;
      }
      if (d <= FREIGHT_MANNERS_TUNING.stringRangeWu
          && now - row.lastYieldAt >= FREIGHT_MANNERS_TUNING.yieldCooldownS
          && row.flashedAt < 0) {
        // Let three strings through; the fourth flashes you across first.
        if (row.yields >= FREIGHT_MANNERS_TUNING.yieldsForPriority) {
          row.flashedAt = now;
          row.yields = 0;
          const data = e.data || (e.data = {});
          data.lampsFlashing = true;
          data.lampFlashUntil = now + FREIGHT_MANNERS_TUNING.leaderLampS;
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PLANTS_MANNERS_FLASH_ACROSS_EVENT, { hullId: e.id, t: now });
            if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
              this.helpers.voice.say({
                channel: 'bark',
                id: 'plants:pl145:across',
                text: FREIGHT_MANNERS_FLASH_LINE,
                kind: 'traffic',
                ttl: 4,
              });
            }
          }
        } else {
          row.yields += 1;
          row.lastYieldAt = now;
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PLANTS_MANNERS_YIELD_EVENT, { hullId: e.id, yields: row.yields, t: now });
          }
        }
      }
      return false;
    }

    // Crossing during a pass without yielding: the strings close ranks.
    const playerSpeed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
    if (isString && !hold && playerSpeed >= FREIGHT_MANNERS_TUNING.crossSpeedWu) {
      const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
      if (d <= FREIGHT_MANNERS_TUNING.stringRangeWu) {
        row.slighted += 1;
        row.lastAt = now;
      }
    }

    if (isString && row.slighted >= FREIGHT_MANNERS_TUNING.slightedThreshold) {
      const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
      if (d <= FREIGHT_MANNERS_TUNING.stringRangeWu) {
        let hullRow = this._mannersHulls.get(e.id);
        if (!hullRow || !(now >= hullRow.lastAt)) {
          if (this._mannersHulls.size >= FREIGHT_MANNERS_TUNING.memoryCap) {
            while (this._mannersHulls.size >= FREIGHT_MANNERS_TUNING.memoryCap) this._mannersHulls.delete(this._mannersHulls.keys().next().value);
          }
          hullRow = { lastBlockAt: -Infinity, lastAt: now };
          this._mannersHulls.set(e.id, hullRow);
        }
        hullRow.lastAt = now;
        if (now - hullRow.lastBlockAt >= FREIGHT_MANNERS_TUNING.hullBlockCooldownS) {
          // Close ranks: block the crossing lane between you and their path.
          const aim = Math.atan2(finite(e.pos.z) - finite(player.pos.z), finite(e.pos.x) - finite(player.pos.x));
          const owned = requestTrafficReaction(this, e, {
            moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: true,
          }, FREIGHT_MANNERS_TUNING.blockDurationS);
          if (!owned) return false; // refused: abort, no second intent writer
          hullRow.lastBlockAt = now;
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PLANTS_MANNERS_RANKS_EVENT, { hullId: e.id, slighted: row.slighted, t: now });
            if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
              this.helpers.voice.say({
                channel: 'bark',
                id: 'plants:pl145:ranks',
                text: FREIGHT_MANNERS_RANKS_LINE,
                kind: 'traffic',
                ttl: 3,
              });
            }
          }
          return true;
        }
      }
    }
    return false;
  },
};
