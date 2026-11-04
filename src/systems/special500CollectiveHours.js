// special500CollectiveHours.js — SP1-173 "The Hours" (special-500 Phase 2, batch 18,
// counter family).
//
// The Collective's tally office counts hours worked in the belt and stamps the ledger with
// the number — permanent, useless, perfectly meaningful. The counter is plain-named and
// save-carried in story.flags:
//   collective_labor_seconds — the accrual: flight sim-time inside sector_ceres_belt,
//                              the hours the tally office can actually see
//   collective_credit_hours  — the stamp: one per hour worked, latched once at the first
//                              station_ceres dock past the authored 20-hour gate; the value
//                              is the stamped number, and it does not grow after stamping
//
// Readers (live, on their owners): the Ceres refinery host's bar line and reply vary by the
// stamped number's tier (src/ui/station/barContacts.js — respect proportional to its size).
// The director's own catalog line is the noticing beat; this system owns the number.
//
// Determinism: the accrual sums update() dt only while the sector is actually held and the
// flight simulation is live (mode flight, timeScale > 0) — paused, docked, menu and other
// sectors accrue nothing. No rng, no wall time. Missing state objects degrade to no-ops.

const SECTOR_ID = 'sector_ceres_belt';
const STATION_ID = 'station_ceres';
// Authored gate: 20+ hours of logged labor.
export const HOURS_GATE = 20;
const SECONDS_PER_HOUR = 3600;

export function laborHours(seconds) {
  return Math.floor(Math.max(0, Number(seconds) || 0) / SECONDS_PER_HOUR);
}

export function createSpecial500CollectiveHours() {
  return {
    name: 'special500CollectiveHours',

    init(ctx) {
      for (const off of this.off || []) { if (typeof off === 'function') off(); }
      this.state = ctx.state;
      this.bus = ctx.bus || null;
      this.off = this.bus ? [this.bus.on('dock:docked', (p) => this._onDocked(p || {}))] : [];
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

    update(dt, state) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      const s = state || this.state;
      if (!s || !s.world || s.world.currentSectorId !== SECTOR_ID) return;
      if (s.mode !== 'flight' || !(s.timeScale > 0)) return;
      const flags = this._flags();
      if (!flags) return;
      if (flags.collective_credit_hours != null) return; // stamped ledgers stop counting
      flags.collective_labor_seconds = (Number(flags.collective_labor_seconds) || 0) + dt;
    },

    _onDocked(payload) {
      const state = this.state;
      const bus = this.bus;
      if (!state || !bus) return;
      if (payload.stationId !== STATION_ID) return;
      const flags = this._flags();
      if (!flags || flags.collective_credit_hours != null) return;
      const hours = laborHours(flags.collective_labor_seconds);
      if (hours < HOURS_GATE) return;
      flags.collective_credit_hours = hours;
      bus.emit('comms:log', {
        from: 'Ceres tally office',
        text: `Your ledger comes back stamped: ${hours} credit hours. One per hour worked, `
          + 'never spendable, always counted. The clerk has done this ten thousand times and '
          + 'believes it every time.',
        kind: 'special500',
      });
    },
  };
}

export const special500CollectiveHours = createSpecial500CollectiveHours();
