// PL-354 The good-hull rate — "The law boards keep quiet hull ratings; hulls that towed
// strangers dock cheaper everywhere for a month, no sign, no announcement."
// What the player can do: Earn the rate; or fake rescue receipts — the boards compare notes
// with the docks, and fakes dock at a premium.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - "Towed strangers" is the shared towWatch view (tether:snapCatch {targetId} latch,
//   massline:releaseValidated release) over a LIVING civilian hull, held for the hold time.
//   The rate is QUIET: it only stamps stations (plantsPl354RateUntil) and emits plants:*
//   events — no popup, no announcement, exactly as the row says.
// - Fake receipts: latching onto something that is not a living stranger (a payload, a
//   beacon) or towing a hull that dies while tethered is a fake rescue — the boards compare
//   notes with the docks: fakes dock at a premium (stamp plantsPl354PremiumUntil + refusal
//   lamps + one receipt).
// - Bounded Maps with tuning.memoryCap; session state RESET on sector:exit / save:loaded /
//   game:new / game:newGame; destroy() unsubscribes.

import { attachTowWatch, towTargetIdOf } from './towWatch.js';

export const PLANTS_RATE_EVENT = 'plants:pl354:rate';
export const PLANTS_FRAUD_EVENT = 'plants:pl354:fraud';

export const GOOD_HULL_TUNING = Object.freeze({
  plId: 'pl354',
  monthS: 600,               // the rate runs a month (table clock)
  holdS: 8,                  // a tow held this long is a rescue, not a snag
  towCreditCap: 4,           // bounded credit ring
  fraudCooldownS: 1800,      // fakes stay hot this long
  memoryCap: 8,
});

export const PL_354_RATE_STAMP = 'plantsPl354RateUntil';
export const PL_354_PREMIUM_STAMP = 'plantsPl354PremiumUntil';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

/** Pure: a living stranger worth towing (not the player, not a prop). */
export function isTowableStranger(state, id, entities) {
  if (id == null) return false;
  if (state && id === state.playerId) return false;
  const e = entities && typeof entities.get === 'function' ? entities.get(id) : null;
  if (!e || e.alive === false) return false;
  if (e.type !== 'ship') return false;
  const d = e.data || {};
  if (d.isGate || d.isWormhole) return false;
  return true;
}

export function createPl354GoodHullRate() {
  return {
    name: 'plantsPl354',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._memory = new Map();     // tow-watch latch rows + credits, bounded
      this._credits = [];           // completed rescue simTimes
      this._latched = null;         // { targetId, since, alive }
      this._fraudUntil = -Infinity;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('dock:range', (p = {}) => this._onDockRange(p || {}));
      on('entity:killed', (p = {}) => this._onKilled(p || {}));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:new', () => this._reset());
      on('game:newGame', () => this._reset());
      this._pl354TowInstalled = false; // re-arm per init: the flag is host-lifetime, the bus is not
      attachTowWatch(this, 'pl354', () => this._memory);
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
      this.state = null;
      this.bus = null;
    },

    _reset() {
      if (this._memory) this._memory.clear();
      if (this._credits) this._credits.length = 0;
      this._latched = null;
      this._fraudUntil = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const target = towTargetIdOf(s, this._memory, now);
      if (target == null) {
        // Released without a latch row or a live tether — settle the tow.
        this._settleTow(now);
        return;
      }
      if (!isTowableStranger(s, target, s.entities)) {
        // Faking a rescue receipt on a prop or a corpse.
        if (this._latched) this._settleTow(now);
        if (now >= this._fraudUntil) {
          this._fraudUntil = now + GOOD_HULL_TUNING.fraudCooldownS;
          this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
          this.bus.emit(PLANTS_FRAUD_EVENT, { kind: 'not_a_stranger', targetId: target, until: this._fraudUntil, t: now });
        }
        this._latched = null;
        return;
      }
      if (!this._latched || this._latched.targetId !== target) {
        this._latched = { targetId: target, since: now };
      }
    },

    _settleTow(now) {
      const latched = this._latched;
      this._latched = null;
      if (!latched) return;
      const s = this.state;
      const target = s.entities && s.entities.get ? s.entities.get(latched.targetId) : null;
      const heldLong = now - latched.since >= GOOD_HULL_TUNING.holdS;
      if (target && target.alive !== false && heldLong) {
        this._credits.push(now);
        while (this._credits.length > GOOD_HULL_TUNING.towCreditCap) this._credits.shift();
        this.bus.emit(PLANTS_RATE_EVENT, { kind: 'rescue', targetId: latched.targetId, credits: this._credits.length, t: now });
      }
    },

    _onKilled(p) {
      // A towed hull dying on your line is a fake rescue receipt.
      if (this._latched && p && p.id === this._latched.targetId) {
        const now = this._now();
        this._latched = null;
        if (now >= this._fraudUntil) {
          this._fraudUntil = now + GOOD_HULL_TUNING.fraudCooldownS;
          this.bus.emit(PLANTS_FRAUD_EVENT, { kind: 'towed_died', targetId: p.id, until: this._fraudUntil, t: now });
        }
      }
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null || p.shipId !== s.playerId || !p.inRange || !p.stationId) return;
      const now = this._now();
      const station = this._stationById(p.stationId);
      if (!station) return;
      const d = station.data || (station.data = {});
      if (now < this._fraudUntil) {
        // Fakes dock at a premium — the boards compare notes with the docks.
        if (!(Number.isFinite(d[PL_354_PREMIUM_STAMP]) && d[PL_354_PREMIUM_STAMP] > now)) {
          d[PL_354_PREMIUM_STAMP] = now + GOOD_HULL_TUNING.monthS;
          d.dockLampsFlashing = true;
          d.dockLampFlashUntil = now + 0.6;
          const id = `plants:pl354:premium:${p.stationId}:${Math.round(now)}`;
          this.bus.emit('comms:popup', { id, sender: 'THE BOARDS', category: 'traffic', text: 'The boards read your receipts. Fakes dock at a premium.', ttl: 7, persist: false });
          this.bus.emit(PLANTS_FRAUD_EVENT, { kind: 'premium_dock', stationId: p.stationId, t: now });
        }
        return;
      }
      // Earned: dock cheaper everywhere for a month, no sign, no announcement.
      const inWindow = this._credits.length > 0 && now - this._credits[this._credits.length - 1] <= GOOD_HULL_TUNING.monthS;
      if (!inWindow) return;
      if (Number.isFinite(d[PL_354_RATE_STAMP]) && d[PL_354_RATE_STAMP] > now) return;
      d[PL_354_RATE_STAMP] = now + GOOD_HULL_TUNING.monthS;
      this.bus.emit(PLANTS_RATE_EVENT, { kind: 'quiet_rate', stationId: p.stationId, until: d[PL_354_RATE_STAMP], t: now });
    },

    _stationById(stationId) {
      const s = this.state;
      const idx = s && s.entityIndex;
      const list = (idx && Array.isArray(idx.stations)) ? idx.stations
        : (s && Array.isArray(s.entityList) ? s.entityList : []);
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station') continue;
        const sid = (st.data && st.data.stationId) || st.id;
        if (sid === stationId) return st;
      }
      return null;
    },
  };
}

export const pl354GoodHullRate = createPl354GoodHullRate();
