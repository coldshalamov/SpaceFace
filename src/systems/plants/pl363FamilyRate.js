// PL-363 The family rate — "Fly one lane long enough and berths quietly go family-rate for
// you — discounts nobody announces, taken off before you see the total."
// What the player can do: Stay in the lane; or change hulls to farm it twice — family means
// the name, and the name only rides one hull.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - Lane tenure is real: continuous sector dwell (sector:enter/exit) plus real docks visited.
//   Tenure earned turns the lane's berths family-rate QUIETLY — stamps
//   plantsPl363FamilyUntil on stations and plants:* events only, no announcement, exactly
//   as the row says.
// - HONEST LIMIT: there is no hull-change event (ship transfer writes no bus receipt), so
//   "change hulls" is detected by its physical signature: the player entity at state.playerId
//   is replaced (a different hull body — ref identity) while the family rate rides. Family
//   means the name, and the name only rides one hull: the lane's stamps are voided and the
//   name is marked farmed for the cooldown. Documented substitute, not a fake.
// - DELIVERY (economy writers are out of scope for plants): the rate is real goods before any
//   berth-fee wiring exists — on the FIRST dock:range arrival edge at a stamped station while
//   the rate is active, the berth attendant hands the discount over IN KIND: a small gift pod
//   (spawnJettisonedCargoPod, berth goods, modest amount) plus one popup, once per
//   station-visit (latch keyed by stationId + arrival edge; a departure edge or a reset opens
//   the next visit). The stamp (plantsPl363FamilyUntil) and the quiet_rate receipt REMAIN for
//   the future economy handoff: when a berth-fee owner reads the stamp, the fee is discounted
//   and this pod is the same money, already delivered.
// - Bounded Maps with tuning.memoryCap; session state RESET on sector:exit / save:loaded /
//   game:new / game:newGame; destroy() unsubscribes.

import { spawnJettisonedCargoPod } from '../lootShards.js';

export const PLANTS_FAMILY_EVENT = 'plants:pl363:family';
export const PLANTS_FARMED_EVENT = 'plants:pl363:farmed';

export const FAMILY_GIFT_SENDER = 'THE BERTH OFFICE';
export const FAMILY_GIFT_LINE = 'Family rate. Taken off before you saw it.';

export const FAMILY_TUNING = Object.freeze({
  plId: 'pl363',
  laneTenureS: 300,          // fly one lane long enough
  docksNeeded: 3,            // real docks visited in the lane
  rateWindowS: 480,          // the quiet discount window per stamp
  farmCooldownS: 1800,       // the name only rides one hull
  hullJumpFrac: 0.5,         // hullMax doubling = a different hull (fallback signature)
  giftCommodityId: 'cmdty_consumer_goods', // berth goods — the discount, in kind
  giftUnits: 2,              // a modest amount
  memoryCap: 8,
});

export const PL_363_FAMILY_STAMP = 'plantsPl363FamilyUntil';
export const PL_363_FARMED_STAMP = 'plantsPl363FarmedUntil';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

export function createPl363FamilyRate() {
  return {
    name: 'plantsPl363',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._dwellS = 0;
      _clearAll.call(this);
      this._docks = new Set();
      this._familySince = null;
      this._farmedUntil = -Infinity;
      this._hullRef = null;
      this._hullMax = null;
      this._visitStation = null;   // the station-visit gift latch (stationId + arrival edge)
      this._visitGifted = false;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('dock:range', (p = {}) => this._onDockRange(p || {}));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:new', () => this._reset());
      on('game:newGame', () => this._hardReset());
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
      _clearAll.call(this);
      if (this._docks) this._docks.clear();
      this._familySince = null;
      this._visitStation = null;
      this._visitGifted = false;
    },

    _hardReset() {
      this._reset();
      this._farmedUntil = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _sector() {
      const s = this.state;
      return (s && s.world && s.world.currentSectorId) || 's1';
    },

    _stations() {
      const s = this.state;
      const idx = s && s.entityIndex;
      if (idx && Array.isArray(idx.stations)) return idx.stations;
      const list = s && Array.isArray(s.entityList) ? s.entityList : [];
      return list.filter((e) => e && e.type === 'station');
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null || p.shipId !== s.playerId || !p.stationId) return;
      if (!p.inRange) {
        // Departure edge: the visit is over; the attendant's once-per-visit latch opens again.
        if (this._visitStation === p.stationId) {
          this._visitStation = null;
          this._visitGifted = false;
        }
        return;
      }
      const now = this._now();
      // Arrival edge (dock:range is edge-emitted): a true for a different station opens a visit.
      if (this._visitStation !== p.stationId) {
        this._visitStation = p.stationId;
        this._visitGifted = false;
      }
      this._docks.add(p.stationId);
      while (this._docks.size >= FAMILY_TUNING.memoryCap * 2) this._docks.delete(this._docks.keys().next().value);
      const station = this._stations().find((st) => st && st.alive !== false
        && (((st.data && st.data.stationId) || st.id) === p.stationId));
      if (!station) return;
      const d = station.data || (station.data = {});
      if (this._familySince != null && now < this._farmedUntil) {
        // Farmed: the name only rides one hull.
        d[PL_363_FAMILY_STAMP] = -Infinity;
        return;
      }
      if (this._familySince != null) {
        d[PL_363_FAMILY_STAMP] = now + FAMILY_TUNING.rateWindowS;
        this.bus.emit(PLANTS_FAMILY_EVENT, { kind: 'quiet_rate', sector: this._sector(), stationId: p.stationId, until: d[PL_363_FAMILY_STAMP], t: now });
        // The discount is delivered IN KIND: goods + words, once per station-visit. The latch
        // is only consumed when the pod actually landed — no words without goods.
        if (!this._visitGifted && this._deliverFamilyGift(station, p.stationId, now)) {
          this._visitGifted = true;
        }
      }
    },

    /** The berth attendant hands the family rate over as goods, with words. */
    _deliverFamilyGift(station, stationId, now) {
      const s = this.state;
      if (!s) return false;
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      const anchor = player && player.pos ? player.pos : (station && station.pos);
      if (!anchor) return false;
      const pod = typeof spawnJettisonedCargoPod === 'function'
        ? spawnJettisonedCargoPod(s, {
          commodityId: FAMILY_TUNING.giftCommodityId,
          amount: FAMILY_TUNING.giftUnits,
          unitMass: 2,
          radius: 4,
          pos: { x: finite(anchor.x) + 12, z: finite(anchor.z) + 8 },
          vel: { x: 0, z: 0 },
          ownerId: s.playerId,
        }, this.helpers)
        : null;
      if (!pod) return false;
      pod.data = pod.data || {};
      pod.data.plantsPl363Gift = { stationId, t: now };   // traceable to the future fee handoff
      pod.data.scanLabel = 'Family rate, in goods — taken off before you saw it';
      const id = `plants:pl363:gift:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: FAMILY_GIFT_SENDER, category: 'traffic', text: FAMILY_GIFT_LINE, ttl: 8, persist: false });
      this.bus.emit(PLANTS_FAMILY_EVENT, { kind: 'gift_pod', sector: this._sector(), stationId, commodityId: FAMILY_TUNING.giftCommodityId, amount: FAMILY_TUNING.giftUnits, t: now });
      return true;
    },

    update(dt) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      if (!player) return;

      // The name only rides one hull: the player entity replaced under us = a hull change.
      // (No ship-change bus receipt exists; ref identity + a hullMax jump is the signature.)
      if (this._hullRef != null && player !== this._hullRef && this._familySince != null) {
        this._farmBite(now);
      }
      this._hullRef = player;
      this._hullMax = Number.isFinite(player.hullMax) ? player.hullMax : null;

      this._dwellS += Math.max(0, finite(dt, 0));
      if (this._familySince == null && this._dwellS >= FAMILY_TUNING.laneTenureS
          && this._docks.size >= FAMILY_TUNING.docksNeeded && now >= this._farmedUntil) {
        this._familySince = now;
        const id = `plants:pl363:family:${Math.round(now)}`;
        // Discounts nobody announces: the quiet receipt only rides the bus.
        this.bus.emit(PLANTS_FAMILY_EVENT, { kind: 'earned', sector: this._sector(), dwellS: Math.round(this._dwellS), t: now });
      }
    },

    _farmBite(now) {
      this._familySince = null;
      this._farmedUntil = now + FAMILY_TUNING.farmCooldownS;
      const sector = this._sector();
      for (const st of this._stations()) {
        if (!st || st.alive === false || !st.data) continue;
        const sd = st.data || {};
        if (sd.isGate || sd.isWormhole) continue;
        if (Number.isFinite(sd[PL_363_FAMILY_STAMP]) && sd[PL_363_FAMILY_STAMP] > now) {
          st.data[PL_363_FAMILY_STAMP] = -Infinity;
        }
        st.data[PL_363_FARMED_STAMP] = now + FAMILY_TUNING.farmCooldownS;
      }
      const id = `plants:pl363:farm:${Math.round(now)}`;
      this.bus.emit('comms:popup', { id, sender: 'THE BERTHS', category: 'traffic', text: 'Family means the name, and the name only rides one hull.', ttl: 8, persist: false });
      this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
      this.bus.emit(PLANTS_FARMED_EVENT, { sector, until: this._farmedUntil, t: now });
    },
  };
}

function _clearAll() {
  this._dwellS = 0;
  this._hullRef = null;
  this._hullMax = null;
}

export const pl363FamilyRate = createPl363FamilyRate();
