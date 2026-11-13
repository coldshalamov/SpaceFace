// PL-121 Your berth — Dock in the same berth five times running and the dockhand chalks your tag on the post.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: Dock in the same berth five times running and the dockhand chalks your tag on
//   the post and shoos strangers out of it
//   What the player can do: Be a regular; or sleep one night in a chalked berth that is not
//   yours — the morning tow is gentle, the look is not
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via YOUR_BERTH_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; shooing strangers is
//   a short leased beat, aborted when refused.
// - Cooldowns per hull key. All session state lives on `this`, never module-level.

import { hash32 } from '../../core/rng.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_YOUR_BERTH_CHALK_EVENT = 'plants:yourBerthChalk';
export const PLANTS_YOUR_BERTH_SHOO_EVENT = 'plants:yourBerthShoo';
export const PLANTS_YOUR_BERTH_TOW_EVENT = 'plants:yourBerthTow';

export const YOUR_BERTH_TUNING = Object.freeze({
  docksForChalk: 5,           // five times running
  runBreakS: 300,             // a gap longer than this breaks the "running" streak
  berthCount: 8,              // berths per station (hash assignment)
  shooRadiusWu: 200,          // strangers inside this of the chalked station get shooed
  berthPointRadiusWu: 60,     // stranger within this of your berth point = squatting
  shooDurationS: 2.5,
  hullShooCooldownS: 6,
  towDelayS: 20,              // sleep one night: the tow comes at "morning"
  towLampS: 1.5,              // the look: the dock lamp burns red through the tow
  memoryCap: 16,              // bounded station + hull rows
});

export const YOUR_BERTH_CHALK_LINE = 'Tagged. Sleep well.';
export const YOUR_BERTH_SHOO_LINE = "That berth's taken.";
export const YOUR_BERTH_TOW_LINE = 'Morning tow. Gently, gently.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): which berth does a pilot keep getting at this station? Deterministic
 * hash of station + pilot identity.
 */
export function berthIdFor(stationId, pilotId, berthCount = YOUR_BERTH_TUNING.berthCount) {
  return `berth-${hash32(String(stationId), 'berth', String(pilotId)) % berthCount}`;
}

/**
 * Memory-row builder (pure): per-station berth bookkeeping, FIFO + stale eviction at the cap.
 */
export function yourBerthRowFor(memory, stationId, now, cap = YOUR_BERTH_TUNING.memoryCap) {
  if (!memory || !stationId) return null;
  let row = memory.get(stationId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > YOUR_BERTH_TUNING.runBreakS * 4) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      pilotId: null,
      berthId: null,
      docks: 0,
      lastDockAt: -Infinity,
      chalked: false,
      towDueAt: -Infinity,
      towedAt: -Infinity,
      lastAt: now,
    };
    memory.set(stationId, row);
  }
  return row;
}

export const yourBerthOps = {
  _initYourBerth(ctx = {}) {
    this._yourBerthMemory = new Map();
    this._yourBerthHulls = new Map();
    if (this.bus && typeof this.bus.on === 'function' && !this._yourBerthInstalled) {
      this._yourBerthInstalled = true;
      this.bus.on('dock:range', (p) => this._onYourBerthDockRange(p));
    }
  },

  _yourBerthMemoryMap() {
    if (!(this._yourBerthMemory instanceof Map)) this._yourBerthMemory = new Map();
    return this._yourBerthMemory;
  },

  _yourBerthStationById(id) {
    if (id == null || !this.state || !Array.isArray(this.state.stations)) return null;
    return this.state.stations.find(
      (s) => s && ((s.data && s.data.stationId) || s.id) === id,
    ) || null;
  },

  _onYourBerthDockRange(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    // UI re-emits of dock:range (device-prompt repaint) carry no shipId — a receipt without a
    // shipId docks nobody and must never schedule a tow of undefined.
    if (payload.shipId == null) return;
    if (payload.inRange !== true) return;
    const now = finite(this.state.simTime, 0);
    const stationId = payload.stationId;
    const row = yourBerthRowFor(this._yourBerthMemoryMap(), stationId, now);
    if (!row) return;
    row.lastAt = now;

    if (payload.shipId === this.state.playerId) {
      // The player's berth history at this station.
      const berthId = berthIdFor(stationId, this.state.playerId);
      if (row.chalked && row.pilotId !== this.state.playerId && row.towDueAt < 0 && row.towedAt < 0) {
        // Sleeping in a chalked berth that is not yours: the morning tow is scheduled.
        row.squatterId = this.state.playerId;
        row.towDueAt = now + YOUR_BERTH_TUNING.towDelayS;
        return;
      }
      const broke = now - row.lastDockAt > YOUR_BERTH_TUNING.runBreakS || row.pilotId !== this.state.playerId;
      if (broke) {
        row.pilotId = this.state.playerId;
        row.berthId = berthId;
        row.docks = 1;
        row.chalked = false;
        row.towDueAt = -Infinity;
        row.towedAt = -Infinity;
        row.squatterId = null;
      } else {
        row.docks += 1;
      }
      row.lastDockAt = now;

      if (!row.chalked && row.docks >= YOUR_BERTH_TUNING.docksForChalk) {
        row.chalked = true;
        const station = this._yourBerthStationById(stationId);
        if (station) {
          const sdata = station.data || (station.data = {});
          sdata.chalkedBerth = { berthId: row.berthId, pilotId: this.state.playerId };
        }
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PLANTS_YOUR_BERTH_CHALK_EVENT, { stationId, berthId: row.berthId, docks: row.docks, t: now });
          this.bus.emit('comms:popup', {
            id: 'plants:pl121:chalk',
            sender: 'DOCKHAND',
            category: 'traffic',
            text: YOUR_BERTH_CHALK_LINE,
            ttl: 6,
          });
        }
      }
      return;
    }

    // A stranger docks in the chalked berth: the dockhand shoos them out of it.
    if (row.chalked && row.squatterId == null) {
      row.squatterId = payload.shipId;
      row.towDueAt = now + YOUR_BERTH_TUNING.towDelayS;
    }
  },

  _yourBerthFireTow(stationId, now) {
    const row = this._yourBerthMemoryMap().get(stationId);
    if (!row || row.towDueAt < 0 || row.towedAt >= 0) return;
    if (now < row.towDueAt) return;
    row.towedAt = now;
    row.towDueAt = -Infinity;
    const station = this._yourBerthStationById(stationId);
    if (station) {
      const sdata = station.data || (station.data = {});
      sdata.dockLampsFlashing = true;
      sdata.dockLampFlashUntil = now + YOUR_BERTH_TUNING.towLampS;
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_YOUR_BERTH_TOW_EVENT, { stationId, squatterId: row.squatterId, t: now });
      this.bus.emit('comms:popup', {
        id: 'plants:pl121:tow',
        sender: 'TUG',
        category: 'traffic',
        text: YOUR_BERTH_TOW_LINE,
        ttl: 6,
      });
    }
  },

  /**
   * Per-hull hook from the traffic dispatch: strangers near your chalked berth get shooed out
   * of it. Returns true while the shoo beat is being flown; aborts when the lease is refused.
   */
  _reactYourBerth(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return false;
    if (state && e.id === state.playerId) return false;

    const now = finite(state.simTime, 0);

    // Any dispatch tick can carry the scheduled morning tow.
    for (const [stationId] of this._yourBerthMemoryMap()) {
      const row = this._yourBerthMemoryMap().get(stationId);
      if (row && row.towDueAt >= 0) this._yourBerthFireTow(stationId, now);
    }

    const data = e.data || {};
    if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;

    // Find a chalked berth this stranger is squatting near.
    let chalked = null;
    for (const [stationId, row] of this._yourBerthMemoryMap()) {
      if (row.chalked && row.pilotId && row.pilotId !== e.id) chalked = { stationId, row };
    }
    if (!chalked) {
      releaseTrafficReaction(this, e);
      return false;
    }
    const station = this._yourBerthStationById(chalked.stationId);
    if (!station || !station.pos) return false;
    const dStation = Math.hypot(finite(e.pos.x) - finite(station.pos.x), finite(e.pos.z) - finite(station.pos.z));
    if (dStation > YOUR_BERTH_TUNING.shooRadiusWu) {
      releaseTrafficReaction(this, e);
      return false;
    }

    // Squatting point: the berth post, offset off the station heart.
    const berthAng = (hash32(chalked.stationId, 'berthPoint', chalked.row.berthId || 'b') % 6283) / 1000;
    const bx = finite(station.pos.x) + Math.cos(berthAng) * YOUR_BERTH_TUNING.berthPointRadiusWu;
    const bz = finite(station.pos.z) + Math.sin(berthAng) * YOUR_BERTH_TUNING.berthPointRadiusWu;
    const dBerth = Math.hypot(finite(e.pos.x) - bx, finite(e.pos.z) - bz);
    if (dBerth > YOUR_BERTH_TUNING.berthPointRadiusWu) return false;

    let hullRow = this._yourBerthHulls.get(e.id);
    if (!hullRow || !(now >= hullRow.lastAt)) {
      if (this._yourBerthHulls.size >= YOUR_BERTH_TUNING.memoryCap) {
        while (this._yourBerthHulls.size >= YOUR_BERTH_TUNING.memoryCap) this._yourBerthHulls.delete(this._yourBerthHulls.keys().next().value);
      }
      hullRow = { lastShooAt: -Infinity, lastAt: now };
      this._yourBerthHulls.set(e.id, hullRow);
    }
    hullRow.lastAt = now;
    if (now - hullRow.lastShooAt < YOUR_BERTH_TUNING.hullShooCooldownS) return false;

    // Shoo: steer away from the berth point.
    const aim = Math.atan2(finite(e.pos.z) - bz, finite(e.pos.x) - bx);
    const owned = requestTrafficReaction(this, e, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, YOUR_BERTH_TUNING.shooDurationS);
    if (!owned) return false; // refused: abort, no second intent writer
    hullRow.lastShooAt = now;

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_YOUR_BERTH_SHOO_EVENT, { hullId: e.id, stationId: chalked.stationId, t: now });
      if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
        this.helpers.voice.say({
          channel: 'bark',
          id: 'plants:pl121:shoo',
          text: YOUR_BERTH_SHOO_LINE,
          kind: 'traffic',
          ttl: 3,
        });
      }
    }
    return true;
  },
};
