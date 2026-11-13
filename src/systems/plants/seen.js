// PL-227 Seen — Wear a mark from one town into a town that has never seen it: a kid points, an old pilot nods once.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: Wear a mark from one town into a town that has never seen it: a kid points,
//   and an old pilot nods once — they know what it took
//   What the player can do: Wear your history around
//
// STATUS: INERT-AND-HONEST. The row needs a mark the player EARNED in one town and can wear
// into another. Grepped for the real store: src/data/bountyMarks.js is wanted-poster NPC
// material for bounty-hunter missions (MARK_NAMES/markArchetypePoolFor — a mark ON you, not
// BY you); src/data/swarmThreatMark.js exports only a scale constant; the HUD "threatMark" is
// a massline gauge element. Nothing readable at runtime records a player-earned town mark or
// ladder-star cosmetic on the player, and inventing `player.data.mark` was exactly the kind of
// dead-field read this row was sent back for. Until a career/record writer lands (e.g. a Pit
// ladder or faction-record seam the player can read and wear), this plant stays dormant: init
// installs nothing, the dock hook always declines, and `markOf` can only ever answer
// not-present. Wire `playerMarkOf(state)` to the real store when it exists — the rest of the
// beat (kid line, single nod) is ready below it.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now().
// - No Three.js or DOM imports.
// - No invented state: this module reads nothing that has no writer.
// - Memory bounded via SEEN_TUNING.memoryCap with FIFO + stale eviction (helpers kept pure for
//   the day the store lands).

export const PLANTS_SEEN_EVENT = 'plants:seenMark';

export const SEEN_TUNING = Object.freeze({
  memoryCap: 16,              // bounded per-station rows
  nodRate: 0.8,               // the old pilot's single, slow nod (audio rate)
  kidTtlS: 4,
});

export const SEEN_KID_LINE = 'Look! That mark!';

/**
 * Decision helper (pure): what mark does the player carry, and from where?
 * INERT: there is no runtime mark store yet (see header), so this can only answer
 * not-present. Replace the single read below with the real career/record field when it ships.
 */
export function markOf() {
  return { present: false, origin: null };
}

/**
 * Memory-row builder (pure): per-station seen bookkeeping, FIFO + stale eviction at the cap.
 * Kept pure and tested so the beat is one `markOf` swap away from working.
 */
export function seenRowFor(memory, stationId, now, cap = SEEN_TUNING.memoryCap) {
  if (!memory || !stationId) return null;
  let row = memory.get(stationId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { seen: false, markOrigin: null, lastAt: now };
    memory.set(stationId, row);
  }
  return row;
}

export const seenOps = {
  _initSeen() {
    this._seenMemory = new Map();
    // INERT: no listeners installed — there is no mark store to read yet (see header).
    return false;
  },

  _seenMemoryMap() {
    if (!(this._seenMemory instanceof Map)) this._seenMemory = new Map();
    return this._seenMemory;
  },

  /**
   * Always declines while the mark store is missing. Kept as the single seam the future
   * wiring calls, so enabling the row later is a one-line change.
   */
  _onSeenDockRange(payload) {
    const player = this.state && this.state.entities
      && (typeof this.state.entities.get === 'function' ? this.state.entities.get(this.state.playerId) : null);
    const mark = markOf(player);
    if (!mark.present) return false;
    // (unreachable until a mark store exists — the full beat lives here on purpose)
    const stationId = payload && payload.stationId;
    const now = Number(this.state && this.state.simTime);
    const row = seenRowFor(this._seenMemoryMap(), stationId, now);
    if (!row || row.seen) return false;
    row.seen = true;
    row.markOrigin = mark.origin;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_SEEN_EVENT, { stationId, origin: mark.origin, t: now });
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: SEEN_TUNING.nodRate });
    }
    return true;
  },
};
