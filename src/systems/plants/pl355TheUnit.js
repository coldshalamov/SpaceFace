// PL-355 The unit — "Help three strangers in one sector and stations start using your
// callsign as a measure — 'one [you] of fuel' meaning a spare tank's worth."
// What the player can do: Be the unit; or price the unit — it changes to somebody else's
// name within the week.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - Help deeds are real receipts: a stranger tow completed alive (shared towWatch view) and
//   a spare dropped beside a broken-down hull that the hull itself collected
//   (cargo:jettisoned + pickup:collected). Three in one sector inside the window makes the
//   unit; the row's quoted measure is used with the hull's callsign substituted for [you].
// - HONEST LIMIT: there is no "price the unit" input seam (no dock-quote UI), so pricing is
//   its physical substitute: shoving a civilian while you are the unit. The measure passes to
//   somebody else within the week (unit voided on a delay, re-earn blocked for the pass
//   window). Documented substitute, not a silent fake.
// - Bounded Maps with tuning.memoryCap; session state RESET on sector:exit / save:loaded /
//   game:new / game:newGame; destroy() unsubscribes.

import { attachTowWatch, towTargetIdOf } from './towWatch.js';
import { isBrokenDown } from './pl259SpareAndShare.js';

export const PLANTS_UNIT_EVENT = 'plants:pl355:unit';
export const PLANTS_UNIT_PASSED_EVENT = 'plants:pl355:passed';

export const UNIT_TUNING = Object.freeze({
  plId: 'pl355',
  deedsNeeded: 3,
  deedWindowS: 600,
  unitWeekS: 900,           // the measure rides for a week (table clock)
  passDelayS: 60,           // it changes to somebody else's name within the week
  reBlockS: 1800,           // no re-earning while the new name rides
  impactCooldownS: 4,       // one collision, one price: no deny spam, no constant re-arming
  giftRangeWu: 260,
  offerMemoryS: 120,
  memoryCap: 12,
});

export const PL_355_UNIT_STAMP = 'plantsPl355UnitUntil';

export function unitMeasureLine(callsign) {
  return `one ${callsign} of fuel`;
}

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

export function createPl355TheUnit() {
  return {
    name: 'plantsPl355',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._memory = new Map();      // tow latch + deeds, bounded
      this._deeds = new Map();       // sectorId -> [simTimes]
      this._unitUntil = -Infinity;
      this._unitSector = null;
      this._passAt = null;
      this._reBlockUntil = -Infinity;
      this._lastPricedAt = -Infinity;
      this._offers = new Map();      // podId -> forHullId
      this._served = new Set();      // pods already given away: never a fresh dump again
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p || {}));
      on('cargo:jettisoned', (p = {}) => this._onJettison(p));
      on('pickup:collected', (p = {}) => this._onPickup(p || {}));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:new', () => this._reset());
      on('game:newGame', () => this._reset());
      this._pl355TowInstalled = false; // re-arm per init: the flag is host-lifetime, the bus is not
      attachTowWatch(this, 'pl355', () => this._memory);
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
      if (this._deeds) this._deeds.clear();
      this._unitUntil = -Infinity;
      this._unitSector = null;
      this._passAt = null;
      this._reBlockUntil = -Infinity;
      this._lastPricedAt = -Infinity;
      if (this._offers) this._offers.clear();
      if (this._served) this._served.clear();
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _sector() {
      const s = this.state;
      return (s && s.world && s.world.currentSectorId) || 's1';
    },

    _deed(sectorId, kind, detail) {
      const now = this._now();
      const list = this._deeds.get(sectorId) || [];
      list.push(now);
      while (list.length && now - list[0] > UNIT_TUNING.deedWindowS) list.shift();
      while (this._deeds.size >= UNIT_TUNING.memoryCap) this._deeds.delete(this._deeds.keys().next().value);
      this._deeds.set(sectorId, list);
      if (list.length >= UNIT_TUNING.deedsNeeded && now >= this._reBlockUntil && this._unitUntil < now) {
        this._becomeUnit(sectorId, now);
      }
    },

    _becomeUnit(sectorId, now) {
      this._unitUntil = now + UNIT_TUNING.unitWeekS;
      this._unitSector = sectorId;
      this._passAt = null;
      const callsign = this._callsign();
      const line = unitMeasureLine(callsign);
      const id = `plants:pl355:unit:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: 'THE BOARDS', category: 'traffic', text: `Stations measure with you now: ${line}.`, ttl: 8, persist: false });
      const voice = this.helpers && this.helpers.voice;
      if (voice && typeof voice.say === 'function') {
        voice.say({ channel: 'comms', id: 'plants:pl355:unit', text: line, ttl: 8 });
      } else {
        this.bus.emit('voice:say', { channel: 'comms', id: 'plants:pl355:unit', text: line, ttl: 8 });
      }
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.0 });
      this.bus.emit(PLANTS_UNIT_EVENT, { kind: 'became', sectorId, callsign, until: this._unitUntil, t: now });
    },

    _callsign() {
      const s = this.state;
      const player = s && s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      const cs = player && player.data && (player.data.callsign || player.data.name);
      return String(cs) !== 'undefined' && cs ? String(cs) : 'REGULAR';
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();

      // The tow deed: a stranger tow held and released alive.
      const target = towTargetIdOf(s, this._memory, now);
      if (target != null && target !== s.playerId) {
        const e = s.entities && s.entities.get ? s.entities.get(target) : null;
        if (e && e.type === 'ship' && e.alive !== false) {
          if (!this._pl355Tow || this._pl355Tow.targetId !== target) {
            this._pl355Tow = { targetId: target, since: now };
          }
        } else {
          this._settleTow(now);
        }
      } else {
        this._settleTow(now);
      }

      // Price the unit: the measure changes hands within the week.
      if (this._passAt != null && now >= this._passAt) {
        this._passAt = null;
        this._unitUntil = -Infinity;
        this._reBlockUntil = now + UNIT_TUNING.reBlockS;
        const id = `plants:pl355:passed:${Math.round(now)}`;
        this.bus.emit('comms:popup', { id, sender: 'THE BOARDS', category: 'traffic', text: 'The measure has a new name this week.', ttl: 6, persist: false });
        this.bus.emit(PLANTS_UNIT_PASSED_EVENT, { sectorId: this._unitSector, t: now });
        this._unitSector = null;
      }
    },

    _settleTow(now) {
      const tow = this._pl355Tow;
      this._pl355Tow = null;
      if (!tow) return;
      const s = this.state;
      const e = s.entities && s.entities.get ? s.entities.get(tow.targetId) : null;
      if (e && e.alive !== false && now - tow.since >= 8) {
        this._deed(this._sector(), 'tow', tow.targetId);
      }
    },

    /** Price the unit (physical substitute): the player SHOVING a civilian voids the measure. */
    _onImpact(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      if (!(this._unitUntil > now)) return;
      const otherId = p.aId === s.playerId ? p.bId : (p.bId === s.playerId ? p.aId : null);
      if (otherId == null) return;
      if (now - this._lastPricedAt < UNIT_TUNING.impactCooldownS) return; // one collision, one price
      const e = s.entities && s.entities.get ? s.entities.get(otherId) : null;
      if (!e || e.type !== 'ship' || e.alive === false) return;
      const d = e.data || {};
      if (d.isGate || d.isWormhole) return;
      // The shove has a direction: the player is the actor — their speed must exceed the
      // other hull's at impact. A civilian ramming the PARKED player prices nothing.
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      const speedOf = (v) => (v ? Math.hypot(Number(v.x) || 0, Number(v.z) || 0) : 0);
      if (speedOf(player && player.vel) <= speedOf(e.vel)) return;
      this._lastPricedAt = now;
      this._passAt = now + UNIT_TUNING.passDelayS;
      this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
      this.bus.emit(PLANTS_UNIT_PASSED_EVENT, { kind: 'priced', at: this._passAt, t: now });
    },

    /** The gift deed: a spare dropped beside a broken-down hull, collected by that hull. */
    _onJettison(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight' || !p || !p.commodityId) return;
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      if (!player || !player.pos) return;
      let needy = null;
      let needyD = UNIT_TUNING.giftRangeWu;
      const ents = s.entities;
      const scan = (e) => {
        if (!e || e.alive === false || e.id === s.playerId || !isBrokenDown(e) || !e.pos) return;
        const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        if (d <= needyD) { needyD = d; needy = e; }
      };
      if (ents && typeof ents.values === 'function') { for (const e of ents.values()) scan(e); }
      else if (Array.isArray(ents)) { for (const e of ents) scan(e); }
      else if (Array.isArray(s.entityList)) { for (const e of s.entityList) scan(e); }
      if (!needy) return;
      let pod = null;
      let podD = UNIT_TUNING.giftRangeWu;
      const scanPod = (e) => {
        if (!e || e.alive === false || e.type !== 'payload' || !e.data || !e.data.jettisonedCargo || !e.pos) return;
        if (this._offers.has(e.id) || this._served.has(e.id)) return; // offered or given away: the fresh dump is the one that counts
        const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
        if (d <= podD) { podD = d; pod = e; }
      };
      if (ents && typeof ents.values === 'function') { for (const e of ents.values()) scanPod(e); }
      else if (Array.isArray(ents)) { for (const e of ents) scanPod(e); }
      else if (Array.isArray(s.entityList)) { for (const e of s.entityList) scanPod(e); }
      if (!pod) return;
      while (this._offers.size >= UNIT_TUNING.memoryCap) this._offers.delete(this._offers.keys().next().value);
      this._offers.set(pod.id, needy.id);
    },

    _onPickup(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight' || !p || p.pickupId == null) return;
      const forHullId = this._offers.get(p.pickupId);
      if (forHullId == null) return;
      this._offers.delete(p.pickupId);
      while (this._served.size >= UNIT_TUNING.memoryCap) this._served.delete(this._served.values().next().value);
      this._served.add(p.pickupId);
      const collector = s.entities && s.entities.get ? s.entities.get(p.collectorId) : null;
      if (p.collectorId !== s.playerId && isBrokenDown(collector)) {
        // The spare reached a broken-down hull — that is the deed, whoever it was.
        this._deed(this._sector(), 'gift', forHullId);
      }
    },
  };
}

export const pl355TheUnit = createPl355TheUnit();
