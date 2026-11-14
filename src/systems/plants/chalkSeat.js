// PL-287 The chalk seat — Veil (design/program/INFERENCE_PLANTS.md, row PL-287).
// "The chalk seat. One seat at the market ring is chalked RESERVED, every day, and nobody
// sits in it. Sit anywhere else and vendors serve your line first."
// What the player can do: Leave the chalk alone; or sit in it — full price for a month,
// and the chalk does not fade.
//
// SEAM NOTE (honest): Veil's market ring is the docking ring of the REAL research station
// body (station_veil, sector_veil_nebula). The chalked seat is a prop at a fixed hash
// bearing, label RESERVED, re-stamped every day (the chalk does not fade); the other
// seats are unmarked props along the same bearing. Sitting is parking slow on a seat for
// tuning.sitNeedS. Sitting anywhere else earns the vendors' favor: "your line first" — a
// service cue, a lamp flash, a stamp, once per visit. Sitting in the RESERVED seat is the
// greed branch: full price for a month (tuning.monthS of the shared 240 s plant day) and
// the favor dries up while the flag stands. Social memory is keyed hull+station in a
// bounded Map (tuning.memoryCap), with the durable receipt in player data
// (plantsPl287FullPriceUntil) — the documented handoff for the economy owner to read for
// real pricing; NO economy writes happen here.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; day stamping and the month clock are
//   pure math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns owned props.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_287_SERVED_EVENT = 'plants:pl287:served';
export const PL_287_SAT_EVENT = 'plants:pl287:sat';
export const PL_287_FULLPRICE_EVENT = 'plants:pl287:fullPrice';

export const CHALK_SEAT_TUNING = Object.freeze({
  stationId: 'station_veil',
  sectorId: 'sector_veil_nebula',
  dayLengthS: 240,
  ringRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the market ring
  seatCount: 3,
  seatSpacingWu: 26,
  reservedIndex: 0,            // seat 0 is the chalked one; the rest are the free line
  sitSpeedWu: 4,
  sitNeedS: 5,
  monthS: 1440,                // six in-world days: "a month" on the plant clock
  servedCooldownS: 40,
  memoryCap: 8,
  sender: 'Market vendors',
});

export const SEAT_SALT = 'plantsPl287Seat';
export const SERVED_LINE = 'Your line first.';
export const FULLPRICE_LINE = 'Full price, then. You know which seat that was.';

/** Seat positions along the market ring bearing (pure; index 0 = the chalked seat). */
export function seatsFor(origin, t = CHALK_SEAT_TUNING) {
  const a = (hash32(SEAT_SALT, t.stationId) % 6283) / 1000;
  const dir = { x: Math.cos(a), z: Math.sin(a) };
  const seats = [];
  for (let i = 0; i < t.seatCount; i += 1) {
    seats.push({
      x: origin.x + dir.x * (i * t.seatSpacingWu),
      z: origin.z + dir.z * (i * t.seatSpacingWu),
      reserved: i === t.reservedIndex,
    });
  }
  return seats;
}

/** Day index of the shared plant clock. */
export function seatDayOf(simTime, t = CHALK_SEAT_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** Pure read: is this hull currently paying full price? */
export function fullPriceAt(entity, now) {
  const until = Number(entity?.data?.plantsPl287FullPriceUntil);
  return Number.isFinite(until) && now < until;
}

export function createChalkSeat() {
  return {
    name: 'plantsPl287',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._seatIds = [];          // parallel to seatsFor()
      this._stampedDay = -1;
      this._sitS = 0;
      this._sittingIndex = null;
      this._lastServedAt = null;
      this._offenseMemory = new Map(); // hull@station -> day, capped social memory
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._drop());
      on('save:loaded', () => this._drop());
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
      this._drop();
      this._offenseMemory?.clear();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._seatIds) if (id != null) rm(id);
      }
      this._seatIds = [];
      this._stampedDay = -1;
      this._sitS = 0;
      this._sittingIndex = null;
      this._lastServedAt = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 8) {
      this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _cue(id, gain = 0.45) {
      this.bus?.emit('audio:cue', { id, gain });
    },

    _emit(type, payload) {
      this.bus?.emit(type, payload);
    },

    _get(id) {
      return this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _ensureSeats(station, day) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const seats = seatsFor(station.pos, CHALK_SEAT_TUNING);
      if (this._seatIds.length !== seats.length) {
        for (let i = 0; i < seats.length; i += 1) {
          const seat = spawn({
            type: 'beacon',
            pos: { x: seats[i].x, z: seats[i].z },
            vel: { x: 0, z: 0 },
            radius: 6,
            mass: 1e6,
            hull: 1,
            hullMax: 1,
            homeSectorId: CHALK_SEAT_TUNING.sectorId,
            data: {
              parentType: 'story_prop',
              storyPropKind: 'plants_market_seat',
              plantsPl287Seat: true,
              plantsPl287Reserved: seats[i].reserved,
              scanLabel: seats[i].reserved
                ? 'Chalked RESERVED \u2014 every day, and nobody sits in it'
                : 'A market seat \u2014 sit here and vendors serve your line first',
              swarmFloorPad: { label: seats[i].reserved ? 'RESERVED' : 'MARKET SEAT' },
            },
          });
          this._seatIds.push(seat && seat.id != null ? seat.id : null);
        }
      }
      // The chalk does not fade: the reserved label re-stamps every day.
      if (this._stampedDay !== day) {
        this._stampedDay = day;
        const reserved = this._seatIds[CHALK_SEAT_TUNING.reservedIndex];
        const ent = reserved != null ? this._get(reserved) : null;
        if (ent?.data) ent.data.swarmFloorPad = { label: 'RESERVED' };
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== CHALK_SEAT_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, CHALK_SEAT_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = CHALK_SEAT_TUNING;
      const day = seatDayOf(now, t);
      this._ensureSeats(station, day);
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      const seats = seatsFor(station.pos, t);
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);

      // Which seat, if any, are we sitting on?
      let index = null;
      for (let i = 0; i < seats.length; i += 1) {
        const d = Math.hypot(player.pos.x - seats[i].x, player.pos.z - seats[i].z);
        if (d <= 14) { index = i; break; }
      }
      if (index == null || speed > t.sitSpeedWu) {
        this._sitS = 0;
        this._sittingIndex = null;
        return;
      }
      if (this._sittingIndex !== index) {
        this._sittingIndex = index;
        this._sitS = 0;
        return;
      }
      this._sitS += Math.max(0, Number(dt) || 0);
      if (this._sitS < t.sitNeedS) return;
      this._sitS = 0;

      const reserved = seats[index].reserved;
      if (reserved) {
        // Sat in the chalked seat: full price for a month, and the chalk does not fade.
        const key = `${s.playerId}@${t.stationId}`;        // social memory: hull + station
        if (this._offenseMemory.size >= t.memoryCap) this._offenseMemory.clear();
        this._offenseMemory.set(key, day);
        const until = now + t.monthS;
        player.data = player.data || {};
        player.data.plantsPl287FullPriceUntil = until;     // documented economy handoff
        this._cue('ui_deny', 0.5);
        this._popup(`plants:pl287:sat:${Math.round(now)}`, t.sender, FULLPRICE_LINE);
        this._emit(PL_287_SAT_EVENT, { until, day, t: now });
        return;
      }

      // Sit anywhere else: vendors serve your line first — unless you're on full price.
      if (fullPriceAt(player, now)) {
        if (this._lastServedAt == null || now - this._lastServedAt >= t.servedCooldownS) {
          this._lastServedAt = now;
          this._cue('ui_deny', 0.4);
          this._popup(`plants:pl287:price:${Math.round(now)}`, t.sender,
            'Full price. The chalk has not faded.');
          this._emit(PL_287_FULLPRICE_EVENT, { day, t: now });
        }
        return;
      }
      if (this._lastServedAt == null || now - this._lastServedAt >= t.servedCooldownS) {
        this._lastServedAt = now;
        this._cue('confirm', 0.45);
        this._popup(`plants:pl287:served:${Math.round(now)}`, t.sender, SERVED_LINE);
        this._emit(PL_287_SERVED_EVENT, { day, t: now });
      }
    },
  };
}

export const chalkSeatPlant = createChalkSeat();
