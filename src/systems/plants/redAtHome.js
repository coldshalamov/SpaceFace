// PL-122 Red at home — Come home wanted and your own berth's lamp burns red; dock dark and the dockhand saw nothing.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: Come home wanted and your own berth's lamp burns red. Dock dark if you like:
//   "Saw nothing."
//   What the player can do: Pay at the window; or keep flying dark, and he keeps seeing nothing
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via RED_AT_HOME_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; this plant only moves
//   lamp state and one line of voice — it steers nobody.
// - Cooldowns per station key. All session state lives on `this`, never module-level.
//
// Wanted state is read from the one live seam: `isPlayerWanted(state)` (src/systems/heat.js)
// reads state.player.heat. Nothing else writes a wanted flag.

import { isPlayerWanted } from '../heat.js';

export const PLANTS_RED_AT_HOME_EVENT = 'plants:redAtHome';
export const PLANTS_RED_AT_HOME_SEEN_NOTHING_EVENT = 'plants:redAtHomeSawNothing';

export const RED_AT_HOME_LINE = 'Saw nothing.';
export const RED_AT_HOME_WINDOW_LINE = "Window's open, pilot.";

export const RED_AT_HOME_TUNING = Object.freeze({
  redLampS: 8,               // the home berth's lamp burns red this long per wanted arrival
  dockCooldownS: 25,         // "he keeps seeing nothing": the dark-dock line, per station, cooldown
  memoryCap: 8,              // bounded home-station rows
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): is the player wanted right now — the live heat ledger read?
 */
export function wantedNow(state) {
  return isPlayerWanted(state);
}

/**
 * Decision helper (pure): did the player dock dark — lamps off?
 */
export function dockedDark(player) {
  if (!player) return true;
  const data = player.data || {};
  return data.lampsOn !== true && data.lampsFlashing !== true;
}

/**
 * Memory-row builder (pure): home-station row, FIFO + stale eviction at the cap.
 */
export function redAtHomeRowFor(memory, key, now, cap = RED_AT_HOME_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      homeStationId: null,
      lastLineAt: -Infinity,
      redUntil: -Infinity,
      lastAt: now,
    };
    memory.set(key, row);
  }
  return row;
}

export const redAtHomeOps = {
  _initRedAtHome(ctx = {}) {
    this._redAtHomeMemory = new Map();
    if (this.bus && typeof this.bus.on === 'function' && !this._redAtHomeInstalled) {
      this._redAtHomeInstalled = true;
      this.bus.on('dock:range', (p) => this._onRedAtHomeDockRange(p));
    }
  },

  _redAtHomeMemoryMap() {
    if (!(this._redAtHomeMemory instanceof Map)) this._redAtHomeMemory = new Map();
    return this._redAtHomeMemory;
  },

  _onRedAtHomeDockRange(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.shipId !== this.state.playerId || payload.inRange !== true) return;
    const now = finite(this.state.simTime, 0);
    const row = redAtHomeRowFor(this._redAtHomeMemoryMap(), 'home', now);
    if (!row) return;
    row.lastAt = now;

    // First dock defines home, for the session.
    if (row.homeStationId == null) {
      row.homeStationId = payload.stationId;
    }
    if (row.homeStationId !== payload.stationId) return; // only home burns red

    const station = this.state && Array.isArray(this.state.stations)
      ? this.state.stations.find((s) => s && ((s.data && s.data.stationId) || s.id) === payload.stationId)
      : null;
    if (!station) return;

    const player = this.state.entities
      && (typeof this.state.entities.get === 'function' ? this.state.entities.get(this.state.playerId) : null);
    const wanted = wantedNow(this.state);
    if (!wanted) {
      // Pay at the window: the red goes out.
      if (row.redUntil >= 0) {
        row.redUntil = -Infinity;
        const sdata = station.data || (station.data = {});
        sdata.dockLampRedUntil = -Infinity;
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit('audio:cue', { id: 'confirm', position: { x: station.pos.x, z: station.pos.z }, gain: 0.6, rate: 1 });
        }
      }
      return;
    }

    if (dockedDark(player)) {
      // Dock dark: he keeps seeing nothing — the exact line, on the quiet channel.
      if (now - row.lastLineAt < RED_AT_HOME_TUNING.dockCooldownS) return;
      row.lastLineAt = now;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_RED_AT_HOME_SEEN_NOTHING_EVENT, { stationId: payload.stationId, t: now });
        if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
          this.helpers.voice.say({
            channel: 'comms',
            id: 'plants:pl122:sawNothing',
            text: RED_AT_HOME_LINE,
            kind: 'traffic',
            ttl: 4,
          });
        }
      }
      return;
    }

    // Docked lit and wanted: your own berth's lamp burns red.
    const sdata = station.data || (station.data = {});
    sdata.dockLampsFlashing = true;
    sdata.dockLampFlashUntil = now + RED_AT_HOME_TUNING.redLampS;
    sdata.dockLampRedUntil = now + RED_AT_HOME_TUNING.redLampS;
    row.redUntil = now + RED_AT_HOME_TUNING.redLampS;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_RED_AT_HOME_EVENT, { stationId: payload.stationId, until: row.redUntil, t: now });
      if (now - row.lastLineAt >= RED_AT_HOME_TUNING.dockCooldownS) {
        row.lastLineAt = now;
        this.bus.emit('comms:popup', {
          id: 'plants:pl122:window',
          sender: 'DOCKHAND',
          category: 'traffic',
          text: RED_AT_HOME_WINDOW_LINE,
          ttl: 5,
        });
      }
    }
  },
};
