// special500HullLog.js — the player-hull counter legs (special-500 Phase 2, batch 18:
// SP2-007 "The Hull Remembers" and SPX-B-02 "The Rookie Scratch").
//
// The real event both legs count is the `combat:damage` receipt the combat damage owner
// emits per accepted packet, with `isPlayer` already adjudicated by that owner. This system
// reads the player's live hull fraction after the hit (the emit is synchronous and
// post-application) and writes plain-named story flags, each latched once:
//   first_hull_damage  { at, day } — SPX-B-02: the first hull damage of the save, any
//                      source that routes the combat damage owner. The Rookie Scratch's
//                      rack vignette arms only when that first scar landed inside the
//                      save's first two sector-days; the flag carries the day so the
//                      reader judges the window honestly.
//   rack_mark_done     simTime — SPX-B-02: the first dock after that scar, where the
//                      dockhand torches your line onto the fender beam and says nothing.
//   hull_held_15       simTime — SP2-007: the first time the hull reads at or below 15%
//                      integrity with the pilot still alive. The bulkhead 3 log line.
//
// Readers (live, on their owners): the shipworks/THE SHIP condition band's history rows
// (src/ui/station/screens/shipworks.js — "BULKHEAD 3 LOG" pulling GRAFFITI.GANG_SHE_HELD
// from src/data/narrative.js, and the "rack mark, {date}" dressing row), and the director's
// own catalog lines. No update() — subscribes at init, never ticks.
//
// Determinism: flags stamp state.simTime and the calendar day index; missing state objects
// degrade to honest no-ops. Collision-only damage that never routes the combat owner is a
// documented scoping line, not a silent second counter.

import { CAL_DAY_S } from '../data/worldCalendar.js';

// Authored line: "a hull event that drops integrity below 15%".
export const HELD_FRACTION = 0.15;
// Authored window: "within the first 2 sector-days of a save" (the director's notBeforeS
// for the same entry is 1200 s — the same two 600 s days).
export const SCRATCH_WINDOW_S = 2 * CAL_DAY_S;

export function createSpecial500HullLog() {
  return {
    name: 'special500HullLog',

    init(ctx) {
      for (const off of this.off || []) { if (typeof off === 'function') off(); }
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      this.off = this.bus ? [
        this.bus.on('combat:damage', (p) => this._onDamage(p || {})),
        this.bus.on('dock:docked', () => this._onDocked()),
      ] : [];
    },

    destroy() {
      for (const off of this.off || []) { try { off(); } catch (e) { /* shutdown */ } }
      this.off = [];
      this.state = null;
      this.bus = null;
    },

    _flags() {
      const state = this.state;
      if (!state) return null;
      if (!state.story) state.story = { flags: {} };
      if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
      return state.story.flags;
    },

    _latch(key, value) {
      const flags = this._flags();
      if (!flags || flags[key] != null) return false;
      flags[key] = value;
      return true;
    },

    _onDamage(payload) {
      const state = this.state;
      if (!state || !this.bus) return;
      if (payload.isPlayer !== true || state.playerId == null) return;
      const player = state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(state.playerId) : null;
      if (!player || player.alive === false) return;
      const hull = Number(player.hull);
      const hullMax = Number(player.hullMax);
      if (!(hullMax > 0) || !Number.isFinite(hull)) return;
      const frac = hull / hullMax;
      const now = Number(state.simTime) || 0;
      const day = Math.floor(now / CAL_DAY_S);

      // SPX-B-02 — the first scar of the save, any source the damage owner routes. The
      // dock vignette arms only if the scar landed inside the first two sector-days.
      if (frac < 1) this._latch('first_hull_damage', { at: now, day });

      // SP2-007 — the hull held below the line, pilot still breathing. One extra line prints
      // in the feed margin; the handwriting is not the player's and the log has no author.
      if (frac > 0 && frac <= HELD_FRACTION && this._latch('hull_held_15', now)) {
        this.bus.emit('comms:log', {
          from: 'BULKHEAD 3 LOG',
          text: 'Damage report complete. One extra line printed in the feed margin, no author '
            + 'field: "SHE HELD TOGETHER. WE DIDN\u2019T." The handwriting is not yours.',
          kind: 'special500',
        });
      }
    },

    // SPX-B-02 — the dock vignette: the first dock after the save's first scar, when the
    // scar landed inside the window. The rack mark is already there when you look.
    _onDocked() {
      const state = this.state;
      if (!state || !this.bus) return;
      const flags = this._flags();
      const scar = flags && flags.first_hull_damage;
      if (!scar || flags.rack_mark_done != null) return;
      const at = Number(scar.at);
      if (!Number.isFinite(at) || at > SCRATCH_WINDOW_S) return; // an old scar earns no mark
      if (!this._latch('rack_mark_done', Number(state.simTime) || 0)) return;
      this.bus.emit('comms:log', {
        from: 'Helios launch rack',
        text: 'While you were cycling the lock, a dockhand torched one more scored line onto '
          + 'the fender beam \u2014 your initials, today\u2019s date \u2014 and said nothing '
          + 'about it. It was already there when you looked.',
        kind: 'special500',
      });
    },
  };
}

export const special500HullLog = createSpecial500HullLog();
