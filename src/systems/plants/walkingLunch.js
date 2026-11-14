// PL-278 The walking lunch — Ceres (design/program/INFERENCE_PLANTS.md, row PL-278).
// "The walking lunch. At the shift bell, street vendors flag down any hull still working
// with the unsold plate — half price, or free if the shift was bad."
// What the player can do: Take it as offered; or demand it free every day — the plate
// starts going to someone else.
//
// SEAM NOTE (honest): the vendor is a real neutral stranger (makeShipEntitySpec, team 2,
// passive) with a cart (chalked prop) and a coin bowl prop, on the docking ring of
// station_ceres (sector_ceres_belt). At the shift bell (phase 0.75 of the shared 240 s
// plant day) any hull still working — inside the traffic shell (6x dockRadius,
// stationBubbles), moving, not docked — gets flagged down with the unsold plate, which is
// a physical payload prop that rides the taker. Whether the shift was bad is deterministic
// (hash32 of the day), and a bad shift means the plate is free. Demanding it free is
// physical: knocking the coin bowl off the cart (a real impact) on a day the shift was
// NOT bad. Do that on two distinct days and the plate starts going to someone else — a
// real queue hull takes it, and the vendor never flags the player again.
// NO economy writes: the price is a line and a plate, never a credits mutation.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; bell phase, bad-shift draw and the
//   demand ledger are pure clock/hash math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded memory: demand-days Map capped at tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns vendor, cart, bowl.
// - The durable bite receipt is flag-borne (state.story.flags.plantsPl278GoneElsewhere).

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_278_OFFER_EVENT = 'plants:pl278:offer';
export const PL_278_TAKEN_EVENT = 'plants:pl278:taken';
export const PL_278_DEMAND_EVENT = 'plants:pl278:demand';
export const PL_278_GONE_EVENT = 'plants:pl278:gone';

export const WALKING_LUNCH_TUNING = Object.freeze({
  stationId: 'station_ceres',
  sectorId: 'sector_ceres_belt',
  dayLengthS: 240,
  bellPhase: 0.75,             // the shift bell
  cartRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the street the vendor walks
  trafficMult: BUBBLE_MULTIPLIERS.traffic,    // 6x — "still working" means inside this shell
  workSpeedWu: 8,
  offerWindowS: 30,            // the flag-down window after the bell
  eatS: 10,
  demandImpulseGate: 80,
  demandDaysForBite: 2,
  memoryCap: 8,
  vendorHull: 'ship_mule',
  vendorFaction: 'faction_dmc',
  vendorCallsign: 'Stall & Go',
});

export const CART_SALT = 'plantsPl278Cart';
export const OFFER_LINE = 'Unsold plate \u2014 half price, going now.';
export const OFFER_FREE_LINE = 'Bad shift for all. Take it, no charge.';
export const GONE_LINE = 'The plate goes to the quiet hulls now.';

/** Day index of the shared plant clock. */
export function lunchDayOf(simTime, t = WALKING_LUNCH_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** Phase of the shared plant day, 0..1. */
export function lunchPhaseOf(simTime, t = WALKING_LUNCH_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  return (((simTime % len) + len) % len) / len;
}

/** Deterministic draw: was this day's shift bad? (free plate day) */
export function shiftWasBad(day) {
  return hash32('plantsPl278Shift', String(day)) % 3 === 0;
}

/** The vendor's street corner: a fixed chalked spot, hash-derived bearing. */
export function cartPointFor(station, t = WALKING_LUNCH_TUNING) {
  const a = (hash32(CART_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.cartRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function createWalkingLunch() {
  return {
    name: 'plantsPl278',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._cartId = null;
      this._bowlId = null;
      this._vendorId = null;
      this._plateId = null;
      this._offeredDay = -1;
      this._offeredAt = null;
      this._offeredTo = null;
      this._carriedSince = null;
      this._demandDays = new Map(); // day -> true, capped ledger
      this._goneElsewhere = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
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
      this._demandDays?.clear();
      this._goneElsewhere = !!(this.state?.story?.flags?.plantsPl278GoneElsewhere);
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._cartId, this._bowlId, this._vendorId, this._plateId]) {
          if (id != null) rm(id);
        }
      }
      this._cartId = null;
      this._bowlId = null;
      this._vendorId = null;
      this._plateId = null;
      this._offeredDay = -1;
      this._offeredAt = null;
      this._offeredTo = null;
      this._carriedSince = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _flags() {
      const s = this.state;
      return s && s.story ? (s.story.flags || (s.story.flags = {})) : null;
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

    _ensureVendor(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const point = cartPointFor(station);
      if (this._cartId == null) {
        const cart = spawn({
          type: 'beacon',
          pos: { x: point.x, z: point.z },
          vel: { x: 0, z: 0 },
          radius: 8,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: WALKING_LUNCH_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_lunch_cart',
            plantsPl278Cart: true,
            placeId: 'place_parts_rack',
            everydaySpaceKit: true,
            scanLabel: 'The walking-lunch cart \u2014 unsold plates go out at the bell',
            swarmFloorPad: { label: 'LUNCH CART' },
          },
        });
        this._cartId = cart && cart.id != null ? cart.id : null;
      }
      if (this._bowlId == null && this._cartId != null) {
        const bowl = spawn({
          type: 'beacon',
          pos: { x: point.x + 10, z: point.z + 4 },
          vel: { x: 0, z: 0 },
          radius: 3,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: WALKING_LUNCH_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_coin_bowl',
            plantsPl278Bowl: true,
            scanLabel: 'The vendor\u2019s coin bowl',
            swarmFloorPad: { label: 'COIN BOWL' },
          },
        });
        this._bowlId = bowl && bowl.id != null ? bowl.id : null;
      }
      if (this._vendorId == null) {
        const spec = makeShipEntitySpec(WALKING_LUNCH_TUNING.vendorHull, {
          team: 2,
          factionId: WALKING_LUNCH_TUNING.vendorFaction,
          pos: { x: point.x + 16, z: point.z - 8 },
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl278Vendor = true;
        spec.data.parentType = 'story_prop';
        spec.data.callsign = WALKING_LUNCH_TUNING.vendorCallsign;
        spec.data.despawnAt = null;
        const ent = spawn(spec);
        if (ent && ent.id != null) this._vendorId = ent.id;
      }
    },

    _spawnStranger(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return null;
      const point = cartPointFor(station);
      const spec = makeShipEntitySpec('ship_drifter', {
        team: 2,
        factionId: WALKING_LUNCH_TUNING.vendorFaction,
        pos: { x: point.x + 30, z: point.z + 12 },
        ai: { archetype: 'passive', passive: true },
      });
      spec.data = spec.data || {};
      spec.data.plantsPl278Stranger = true;
      spec.data.parentType = 'story_prop';
      spec.data.despawnAt = null;
      return spawn(spec);
    },

    _spawnPlate(toId, free, now, day) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._plateId != null) return;
      const to = this._get(toId);
      const plate = spawn({
        type: 'payload',
        pos: { x: (to?.pos.x ?? 0) + 10, z: (to?.pos.z ?? 0) + 6 },
        vel: { x: 0, z: 0 },
        radius: 3,
        mass: 2,
        physicsBody: { mass: 2 },
        flags: { persistent: true },
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_unsold_plate',
          plantsPl278Plate: true,
          masslineTetherable: true,
          scanLabel: 'The unsold plate, still hot',
          swarmFloorPad: { label: 'UNSOLD PLATE' },
          plantsPl278Free: !!free,
          plantsPl278Holder: toId,
        },
      });
      if (plate && plate.id != null) {
        this._plateId = plate.id;
        this._offeredDay = day;
        this._offeredAt = now;
        this._offeredTo = toId;
        this._emit(PL_278_OFFER_EVENT, { toId, free: !!free, day, t: now });
      }
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p || this._bowlId == null) return;
      const bowl = [p.aId, p.bId]
        .map((id) => (id != null ? this._get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl278Bowl === true);
      if (!bowl) return;
      if (p.aId !== s.playerId && p.bId !== s.playerId) return;
      if ((Number(p.impulse) || 0) < WALKING_LUNCH_TUNING.demandImpulseGate) return;
      const now = this._now();
      const day = lunchDayOf(now);
      if (shiftWasBad(day)) return;                        // it was already free today
      if (this._demandDays.has(day)) return;               // the day-set is the latch: one demand per day
      if (this._demandDays.size >= WALKING_LUNCH_TUNING.memoryCap) {
        const oldest = [...this._demandDays.keys()].sort((a, b) => a - b)[0];
        this._demandDays.delete(oldest);
      }
      this._demandDays.set(day, true);
      this._cue('ui_deny', 0.45);
      this._popup(`plants:pl278:demand:${Math.round(now)}`, WALKING_LUNCH_TUNING.vendorCallsign,
        'Fine. Today it\u2019s free.');
      this._emit(PL_278_DEMAND_EVENT, { day, demands: this._demandDays.size, t: now });
      // Demanded free too many days: the plate starts going to someone else.
      if (this._demandDays.size >= WALKING_LUNCH_TUNING.demandDaysForBite && !this._goneElsewhere) {
        this._goneElsewhere = true;
        const flags = this._flags();
        if (flags) flags.plantsPl278GoneElsewhere = true;
        this._popup(`plants:pl278:gone:${Math.round(now)}`, WALKING_LUNCH_TUNING.vendorCallsign, GONE_LINE);
        this._emit(PL_278_GONE_EVENT, { day, t: now });
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== WALKING_LUNCH_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, WALKING_LUNCH_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = WALKING_LUNCH_TUNING;
      this._ensureVendor(station);
      const day = lunchDayOf(now, t);
      const phase = lunchPhaseOf(now, t);
      const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
        ? station.data.dockRadius : 72;

      // The vendor walks a short beat by the cart.
      const vendor = this._vendorId != null ? this._get(this._vendorId) : null;
      const point = cartPointFor(station, t);
      if (vendor?.pos) {
        vendor.pos.x = point.x + Math.sin(now / 9) * 12;
        vendor.pos.z = point.z + Math.cos(now / 9) * 8;
      }

      // At the shift bell: flag down a hull still working.
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (player?.pos && phase >= t.bellPhase && phase < t.bellPhase + t.offerWindowS / t.dayLengthS
          && this._plateId == null && this._offeredDay !== day) {
        const d = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z);
        const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
        const stillWorking = d <= base * t.trafficMult && speed > t.workSpeedWu;
        const free = shiftWasBad(day);
        if (stillWorking && !this._goneElsewhere) {
          if (free) this._cue('confirm', 0.4);
          this._popup(`plants:pl278:offer:${Math.round(now)}`, t.vendorCallsign,
            free ? OFFER_FREE_LINE : OFFER_LINE);
          this._spawnPlate(s.playerId, free, now, day);
        } else if (this._goneElsewhere && stillWorking) {
          // The plate goes to someone else: a real stranger hull takes it at the bell.
          const stranger = this._spawnStranger(station);
          if (stranger?.id != null) {
            this._popup(`plants:pl278:elsewhere:${Math.round(now)}`, t.vendorCallsign, GONE_LINE);
            this._spawnPlate(stranger.id, free, now, day);
          }
        }
      }

      // Carry the plate: taking it as offered.
      const plate = this._plateId != null ? this._get(this._plateId) : null;
      if (!plate || plate.alive === false) { this._plateId = null; return; }
      if (this._offeredTo === s.playerId) {
        plate.pos.x = player.pos.x + 10;
        plate.pos.z = player.pos.z + 5;
        if (this._carriedSince == null) this._carriedSince = now;
        if (now - this._carriedSince >= t.eatS) {
          this.helpers?.removeEntity?.(this._plateId);
          this._plateId = null;
          this._carriedSince = null;
          this._cue('confirm', 0.4);
          this._emit(PL_278_TAKEN_EVENT, { day, free: plate.data?.plantsPl278Free === true, t: now });
        }
      } else if (this._offeredTo != null) {
        // The plate went to a stranger: it rides their quarter, then the shift eats it.
        const holder = this._get(this._offeredTo);
        if (holder?.pos) {
          plate.pos.x = holder.pos.x + 10;
          plate.pos.z = holder.pos.z + 6;
        }
      }
    },
  };
}

export const walkingLunchPlant = createWalkingLunch();
