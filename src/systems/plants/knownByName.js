// PL-250 Known by name — Near a town that has named you, civilians give you room; exploit it and they mutter.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: Near a town that has named you, civilians give you room — your own name, no
//   mark needed
//   What the player can do: Enjoy it; or exploit it — they let you, muttering
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via KNOWN_BY_NAME_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; giving room is a
//   leased steer-out beat, aborted when refused.
// - Cooldowns per hull key. All session state lives on `this`, never module-level.

import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_KNOWN_ROOM_EVENT = 'plants:knownByNameRoom';
export const PLANTS_KNOWN_MUTTER_EVENT = 'plants:knownByNameMutter';

export const KNOWN_BY_NAME_TUNING = Object.freeze({
  namedRangeWu: 420,          // inside this of a town that has named you
  roomRadiusWu: 90,           // civilians give you room inside this
  roomShrinkWu: 18,           // each exploit shrinks the room
  minRoomWu: 36,              // the room never closes fully
  roomDurationS: 2,
  hullCooldownS: 4,
  exploitWindowS: 30,         // room grants inside this window count as exploiting
  exploitForMutter: 3,        // the third press earns the mutter
  boardScanBudget: 48,        // entities examined per tick for chalk props (bounded walk)
  memoryCap: 24,              // bounded hull rows
});

export const KNOWN_MUTTER_LINE = 'Always letting him through.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): has this town named you? Reads the board stamp the chalk writers
 * leave (station.data.boardName + boardNameFor) — no mark needed.
 */
export function townNamedYou(station, playerId) {
  if (!station || !station.data || !playerId) return false;
  const data = station.data;
  return typeof data.boardName === 'string' && data.boardName.length > 0 && data.boardNameFor === playerId;
}

/**
 * Decision helper (pure): does a chalked board prop near this position name the player? Reads
 * the physical board props PL-228/PL-229 spawn (data.plantsBoardName {forPlayer, name}).
 */
export function boardChalkNamesYou(entities, pos, playerId, tuning = KNOWN_BY_NAME_TUNING) {
  if (!entities || !pos || !playerId) return false;
  let scanned = 0;
  const push = (e) => {
    if (scanned >= tuning.boardScanBudget || !e || e.alive === false || !e.pos) return;
    scanned += 1;
    const stamp = e.data && e.data.plantsBoardName;
    if (!stamp || stamp.forPlayer !== playerId) return;
    const d = Math.hypot(finite(e.pos.x) - finite(pos.x), finite(e.pos.z) - finite(pos.z));
    if (d <= tuning.namedRangeWu) found = true;
  };
  let found = false;
  if (typeof entities.values === 'function') { for (const e of entities.values()) { push(e); if (found) break; } }
  else if (Array.isArray(entities)) { for (const e of entities) { push(e); if (found) break; } }
  return found;
}

/**
 * Decision helper (pure): the current room radius after exploits (bounded floor).
 */
export function roomRadiusFor(exploits, tuning = KNOWN_BY_NAME_TUNING) {
  const shrink = Math.max(0, Math.floor(Number(exploits) || 0)) * tuning.roomShrinkWu;
  return Math.max(tuning.minRoomWu, tuning.roomRadiusWu - shrink);
}

/**
 * Memory-row builder (pure): per-hull room bookkeeping, FIFO + stale eviction at the cap.
 */
export function knownRowFor(memory, hullId, now, cap = KNOWN_BY_NAME_TUNING.memoryCap) {
  if (!memory || !hullId) return null;
  let row = memory.get(hullId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > KNOWN_BY_NAME_TUNING.exploitWindowS * 4) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { lastRoomAt: -Infinity, grants: 0, windowStartAt: -Infinity, muttered: false, lastAt: now };
    memory.set(hullId, row);
  }
  return row;
}

export const knownByNameOps = {
  _initKnownByName(ctx = {}) {
    this._knownMemory = new Map();
    this._knownLastScanTick = -1;
    this._knownBoardNamed = false;
  },

  _knownMemoryMap() {
    if (!(this._knownMemory instanceof Map)) this._knownMemory = new Map();
    return this._knownMemory;
  },

  /**
   * Per-hull hook from the traffic dispatch: civilians give a named pilot room. Returns true
   * while this hull is flying its steer-out beat; aborts when the lease is refused.
   */
  _reactKnownByName(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!player || player.alive === false || !player.pos) return false;
    if (!e || e.alive === false || e.type !== 'ship' || !e.pos) return false;
    if (e.id === state.playerId) return false;
    const data = e.data || {};
    if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
    if (data.disabled || data.derelict) return false;
    if (data.ai && data.ai.pirate === true) return false;

    const now = finite(state.simTime, 0);

    // A town nearby that has named you? Two sources of truth agree: the chalk writers'
    // station stamp, or their physical board props (tick-gated prop scan).
    let named = false;
    const stationList = Array.isArray(stations) && stations.length ? stations : (Array.isArray(state.stations) ? state.stations : []);
    for (const station of stationList) {
      if (!station || !station.pos) continue;
      if (!townNamedYou(station, state.playerId)) continue;
      const d = Math.hypot(finite(player.pos.x) - finite(station.pos.x), finite(player.pos.z) - finite(station.pos.z));
      if (d <= KNOWN_BY_NAME_TUNING.namedRangeWu) { named = true; break; }
    }
    if (!named && state.entities) {
      const tick = Number.isInteger(state.tick) ? state.tick : 0;
      if (tick !== this._knownLastScanTick) {
        this._knownLastScanTick = tick;
        this._knownBoardNamed = boardChalkNamesYou(state.entities, player.pos, state.playerId);
      }
      named = this._knownBoardNamed === true;
    }
    if (!named) {
      releaseTrafficReaction(this, e);
      return false;
    }

    const d = Math.hypot(finite(e.pos.x) - finite(player.pos.x), finite(e.pos.z) - finite(player.pos.z));
    const row = knownRowFor(this._knownMemoryMap(), e.id, now);
    if (!row) return false;
    row.lastAt = now;
    const radius = roomRadiusFor(row.grants);
    if (d > radius) return false;
    if (now - row.lastRoomAt < KNOWN_BY_NAME_TUNING.hullCooldownS) return false;

    // Give room: steer out, briefly.
    const aim = Math.atan2(finite(e.pos.z) - finite(player.pos.z), finite(e.pos.x) - finite(player.pos.x));
    const owned = requestTrafficReaction(this, e, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, KNOWN_BY_NAME_TUNING.roomDurationS);
    if (!owned) return false; // refused: abort, no second intent writer
    row.lastRoomAt = now;
    row.grants += 1;
    if (row.windowStartAt < 0 || now - row.windowStartAt > KNOWN_BY_NAME_TUNING.exploitWindowS) {
      row.windowStartAt = now;
    }

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_KNOWN_ROOM_EVENT, { hullId: e.id, grants: row.grants, radius, t: now });
    }

    // Exploit it: enough presses inside the window and they let you, muttering.
    if (!row.muttered && row.grants >= KNOWN_BY_NAME_TUNING.exploitForMutter
        && now - row.windowStartAt <= KNOWN_BY_NAME_TUNING.exploitWindowS) {
      row.muttered = true;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_KNOWN_MUTTER_EVENT, { hullId: e.id, grants: row.grants, t: now });
        if (this.helpers && this.helpers.voice && typeof this.helpers.voice.say === 'function') {
          this.helpers.voice.say({
            channel: 'bark',
            id: 'plants:pl250:mutter',
            text: KNOWN_MUTTER_LINE,
            kind: 'traffic',
            ttl: 4,
          });
        }
      }
    }
    return true;
  },
};
