// PL-153 The minute — "Every shift change your drill head stops dead for one minute, whatever
// it is in the middle of | Be there for the minute; the drill taps twice, like the rest of the Rock"
//
// HONEST SEAM NOTE: the drill head itself is owned by src/systems/drill.js — its session
// (`drill:start` … `drill:end`) is UI-screen state, not a towable body, and this plant has no
// authority to freeze another system's stepping. What is faithfully implemented is everything
// the row OBSERVES from outside: at every shift change while a drill session is live, the
// minute opens (one per boundary), the drill taps twice — two real audio taps, a beat apart —
// and the minute is announced on comms. The hard stop of the head would need a drill.js seam.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes everything, clears state.
// - One minute per shift boundary; boundaries come from the fixed half-day sim clock.
// - The second tap is scheduled in sim time (update), never with wall-clock timers.

export const PL_153_MINUTE_EVENT = 'plants:pl153:minute';

export const THE_MINUTE_TUNING = Object.freeze({
  dayLengthS: 240,
  shiftLengthS: 120,          // two shifts to the in-world day
  minuteS: 60,                // "stops dead for one minute"
  tapGapS: 0.9,               // ...and taps twice
  tap2Rate: 1.25,             // the second tap rings a touch brighter
  tap1Rate: 0.85,
  memoryCap: 4,               // bounded boundary ledger
});

/** The index of the shift containing simTime — boundaries sit at multiples of shiftLengthS. */
export function shiftIndexOf(simTime, t = THE_MINUTE_TUNING) {
  const len = Math.max(1, t.shiftLengthS);
  return Math.floor(simTime / len);
}

/** Seconds into the current shift (0 = standing on the boundary). */
export function shiftPhaseS(simTime, t = THE_MINUTE_TUNING) {
  const len = Math.max(1, t.shiftLengthS);
  return ((simTime % len) + len) % len;
}

export function createPl153TheMinute() {
  return {
    name: 'plantsPl153',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._session = null;       // { startedAt, asteroidId }
      this._lastShiftSeen = -1;
      this._minuteOpenAt = null;
      this._minuteDone = false;
      this._tap2At = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('drill:start', (p = {}) => {
        this._session = { startedAt: this._now(), asteroidId: p.asteroidId ?? null };
        this._lastShiftSeen = -1;
      });
      on('drill:end', () => {
        this._session = null;
        this._minuteOpenAt = null;
        this._minuteDone = false;
        this._tap2At = null;
      });
      on('sector:exit', () => { this._minuteOpenAt = null; this._tap2At = null; });
      on('save:loaded', () => { this._session = null; this._minuteOpenAt = null; this._tap2At = null; });
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
      this._session = null;
      this._lastShiftSeen = -1;
      this._minuteOpenAt = null;
      this._minuteDone = false;
      this._tap2At = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight' || !this._session) return;
      const now = this._now();
      const t = THE_MINUTE_TUNING;
      // The minute opens ON a boundary crossing and stays open for its full minute.
      if (this._minuteOpenAt == null) {
        const shiftIndex = shiftIndexOf(now, t);
        const crossing = shiftIndex !== this._lastShiftSeen && shiftPhaseS(now, t) < 1;
        this._lastShiftSeen = shiftIndex;
        if (crossing) {
          this._minuteOpenAt = now;
          this._minuteDone = false;
          this._tap2At = now + t.tapGapS;
          this.bus?.emit('comms:popup', {
            id: `plants:pl153:minute:${shiftIndex}`,
            sender: 'The Rock',
            category: 'story',
            text: 'Shift change: the drill stops dead, one minute.',
            ttl: 6,
            persist: false,
          });
          this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', rate: t.tap1Rate, gain: 0.6 });
          this.bus?.emit(PL_153_MINUTE_EVENT, {
            shiftIndex,
            openAt: now,
            until: now + t.minuteS,
            t: now,
          });
        }
      }
      if (this._tap2At != null && now >= this._tap2At) {
        this._tap2At = null;
        this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', rate: t.tap2Rate, gain: 0.6 });
      }
      if (this._minuteOpenAt != null && !this._minuteDone && now >= this._minuteOpenAt + t.minuteS) {
        this._minuteDone = true;
        this._minuteOpenAt = null;
        this.bus?.emit('audio:cue', { id: 'confirm' });
      }
    },
  };
}

export const pl153TheMinute = createPl153TheMinute();
