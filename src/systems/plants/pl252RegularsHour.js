// PL-252 The regular's hour — "The hauler that first called on your light comes back at the
// same hour every week, expecting the hopper full | Be full; or miss the hour — it circles
// once, leaves, and the next call is a long time off"
//
// Seam: PL-146's caller owns the schedule; this plant owns the EXPECTATION. Every
// `plants:pl146:call` after the first is the regular arriving at his hour. The hopper is the
// honest physical read: the player's own hold, ore commodities summed. Be full and the week
// holds its shape; miss the hour and the regular circles once, leaves, and `plants:pl252:missed`
// pushes PL-146's next call out a long stretch.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes everything, clears bounded Maps.
// - The hopper read is pure: sums state.player.cargo.items entries whose commodity id is ore.

export const PL_252_SERVED_EVENT = 'plants:pl252:served';
export const PL_252_MISS_EVENT = 'plants:pl252:missed';

export const REGULARS_HOUR_TUNING = Object.freeze({
  hopperMinU: 10,             // "expecting the hopper full"
  orePrefix: 'cmdty_ore',
  hourTolerance: 0.05,        // same hour of the in-world day, plus or minus
  dayLengthS: 240,
  memoryCap: 4,
});

/** The hopper read: total ore units in the player's hold. Pure. */
export function oreInHold(player, t = REGULARS_HOUR_TUNING) {
  const items = player?.cargo?.items;
  if (!items || typeof items !== 'object') return 0;
  let total = 0;
  for (const id of Object.keys(items)) {
    if (typeof id === 'string' && id.startsWith(t.orePrefix)) {
      total += Math.max(0, Number(items[id]) || 0);
    }
  }
  return total;
}

export function atTheRegularHour(hourOfDay, regularHour, t = REGULARS_HOUR_TUNING) {
  if (!Number.isFinite(hourOfDay) || !Number.isFinite(regularHour)) return false;
  const len = 1;
  const d = Math.abs(((hourOfDay - regularHour) % len + len) % len);
  return Math.min(d, len - d) <= t.hourTolerance;
}

export function createPl252RegularsHour() {
  return {
    name: 'plantsPl252',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._regularHour = null;   // the hour of the FIRST call, kept
      this._lastVisit = null;     // { visit, at }
      this._misses = 0;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('plants:pl146:call', (p = {}) => this._onCall(p));
      on('sector:exit', () => { this._lastVisit = null; });
      on('save:loaded', () => { this._lastVisit = null; });
      on('game:new', () => this._resetSession());
      on('game:newGame', () => this._resetSession());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      this._regularHour = null;
      this._lastVisit = null;
      this._misses = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _onCall(payload) {
      const now = this._now();
      const t = REGULARS_HOUR_TUNING;
      const visit = Number(payload.visit) || 0;
      if (visit >= 1 && this._regularHour == null && Number.isFinite(payload.hourOfDay)) {
        this._regularHour = payload.hourOfDay; // the regular's hour is the first call's hour
      }
      if (visit < 2) return; // the first call is the introduction, not the expectation
      // Judge the hopper on EVERY visit — including rescheduled calls that land off the
      // regular's hour (a snuffed lamp or a missed hopper moves the hour; the expectation
      // travels with the hauler).
      const late = !atTheRegularHour(payload.hourOfDay, this._regularHour ?? payload.hourOfDay, t);
      // The hopper is the sim's hold bag (state.player.cargo), not the physics hull.
      const ore = oreInHold({ cargo: this.state?.player?.cargo }, t);
      if (ore >= t.hopperMinU) {
        this.bus?.emit('comms:popup', {
          id: `plants:pl252:served:${Math.round(now)}`,
          sender: 'Hauler, unlogged',
          category: 'story',
          text: 'Found you full. Same hour next week.',
          ttl: 7,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'confirm' });
        this.bus?.emit(PL_252_SERVED_EVENT, { visit, ore, late, t: now });
      } else {
        this._misses += 1;
        this.bus?.emit('comms:popup', {
          id: `plants:pl252:missed:${Math.round(now)}`,
          sender: 'Hauler, unlogged',
          category: 'story',
          text: 'Hopper\u2019s empty. It circles once, leaves.',
          ttl: 8,
          persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'ui_deny' });
        this.bus?.emit(PL_252_MISS_EVENT, { visit, ore, late, misses: this._misses, t: now });
      }
      this._lastVisit = { visit, at: now };
    },
  };
}

export const pl252RegularsHour = createPl252RegularsHour();
