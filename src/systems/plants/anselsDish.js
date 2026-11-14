// PL-273 Ansel's dish — Helios (design/program/INFERENCE_PLANTS.md, row PL-273).
// "Ansel's dish. The dish chalked up for a regular who never came back gets cooked one
// night anyway and set on the sill, steaming, no name on it."
// What the player can do: Eat it and ring the bell twice for thanks; leave it; or order
// something else while it cools — you watch him scrape it into the recycler.
//
// SEAM NOTE (honest): Ansel's galley is not a coded interior, so the sill is a fixed chalked
// prop on the docking ring of the REAL Helios body (station_helios, sector_helios_prime).
// The dish is a physical payload prop cooked during the night band of the shared 240 s plant
// day; the bell is a second prop at the sill. Eating is carrying the dish long enough.
// Ringing the bell twice is two real physics impacts inside the knock window. "Ordering
// something else while it cools" is docking (the real dock:range gate) while an unclaimed
// dish is still on the sill — Ansel sees you went inside for something else, and scrapes it.
// Leaving it means the dish is quietly recycled at dawn; nothing is remembered.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
//   The sill bearing is hash32(salt, stationId); night band and dish night are pure clock math.
// - No Three.js, no DOM. The sim stamps props and emits cues; presentation reads them.
// - Bounded memory: one dish per night, thanks once per night, bitten-nights ledger capped
//   at tuning.memoryCap entries.
// - Session state on `this`; destroy() unsubscribes all + despawns owned props + clears Maps.
// - NO economy writes: eating is physical; the scraped-dish memory is a flag-borne receipt
//   (plantsPl273ScrapedUntil on station data) other owners may read, never a credits mutation.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_273_DISH_EVENT = 'plants:pl273:dish';
export const PL_273_EATEN_EVENT = 'plants:pl273:eaten';
export const PL_273_THANKS_EVENT = 'plants:pl273:thanks';
export const PL_273_SCRAPED_EVENT = 'plants:pl273:scraped';

export const ANSELS_DISH_TUNING = Object.freeze({
  stationId: 'station_helios',
  sectorId: 'sector_helios_prime',
  dayLengthS: 240,
  nightFraction: 0.25,         // last quarter of the day: the galley night
  sillRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the sill apron
  dishRadius: 4,
  pickupRangeWu: 26,
  eatS: 12,                    // carried long enough counts as eaten
  bellImpulseGate: 60,
  knockWindowS: 3,
  tapCooldownS: 0.6,           // one contact grind is one tap: frames inside this are the same hit
  scrapCooldownS: 8,           // the scrape is one motion, not a loop
  memoryCap: 8,
  sender: 'Ansel',
});

export const DISH_SALT = 'plantsPl273Sill';
export const ANSEL_LINE = 'For whoever\u2019s still hungry.';
export const SCRAPE_LINE = 'You watch him scrape it into the recycler.';

/** Night band of the shared 240 s plant day. */
export function nightAt(simTime, t = ANSELS_DISH_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  return phase >= len * (1 - t.nightFraction);
}

/** Day index of the shared plant clock. */
export function dishDayOf(simTime, t = ANSELS_DISH_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** The sill: a fixed chalked spot on the docking ring, hash-derived bearing. */
export function sillPointFor(station, t = ANSELS_DISH_TUNING) {
  const a = (hash32(DISH_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.sillRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function createAnselsDish() {
  return {
    name: 'plantsPl273',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._sillId = null;
      this._bellId = null;
      this._dishId = null;
      this._dishNight = -1;
      this._dishScrapedNight = -1;
      this._carried = false;
      this._carriedSince = null;
      this._eatenNight = -1;
      this._rings = [];            // knock timestamps, bounded
      this._lastTapHitAt = null;
      this._thanksNight = -1;
      this._scrapedAt = null;
      this._lastNight = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
      on('dock:range', (p) => this._onDock(p));
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
      this._thanksNight = -1;
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._sillId, this._bellId, this._dishId]) {
          if (id != null) rm(id);
        }
      }
      this._sillId = null;
      this._bellId = null;
      this._dishId = null;
      this._dishNight = -1;
      this._dishScrapedNight = -1;
      this._carried = false;
      this._carriedSince = null;
      this._eatenNight = -1;
      this._rings = [];
      this._lastTapHitAt = null;
      this._scrapedAt = null;
      this._lastNight = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 8) {
      this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _say(id, text, channel = 'ambient') {
      this.bus?.emit('voice:say', { channel, id, text, ttl: 6 });
    },

    _cue(id, gain = 0.45, rate) {
      const payload = { id, gain };
      if (rate != null) payload.rate = rate;
      this.bus?.emit('audio:cue', payload);
    },

    _emit(type, payload) {
      this.bus?.emit(type, payload);
    },

    _get(id) {
      return this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _ensureSill(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      if (this._sillId == null) {
        const point = sillPointFor(station);
        const sill = spawn({
          type: 'beacon',
          pos: { x: point.x, z: point.z },
          vel: { x: 0, z: 0 },
          radius: 8,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: ANSELS_DISH_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_ansel_sill',
            plantsPl273Sill: true,
            placeId: 'place_passenger_platform',
            everydaySpaceKit: true,
            scanLabel: 'Ansel\u2019s galley sill — chalked for a regular who never came back',
            swarmFloorPad: { label: 'ANSEL\u2019S SILL' },
          },
        });
        this._sillId = sill && sill.id != null ? sill.id : null;
      }
      if (this._bellId == null && this._sillId != null) {
        const sill = this._get(this._sillId);
        const bell = spawn({
          type: 'beacon',
          pos: { x: (sill?.pos.x ?? 0) + 12, z: (sill?.pos.z ?? 0) + 6 },
          vel: { x: 0, z: 0 },
          radius: 4,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: ANSELS_DISH_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_ansel_bell',
            plantsPl273Bell: true,
            scanLabel: 'The counter bell — ring it twice to say thanks',
            swarmFloorPad: { label: 'THE BELL' },
          },
        });
        this._bellId = bell && bell.id != null ? bell.id : null;
      }
    },

    _spawnDish(station, now, night) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const sill = this._get(this._sillId);
      const dish = spawn({
        type: 'payload',
        pos: { x: (sill?.pos.x ?? station.pos.x) + 6, z: (sill?.pos.z ?? station.pos.z) - 6 },
        vel: { x: 0, z: 0 },
        radius: ANSELS_DISH_TUNING.dishRadius,
        mass: 3,
        physicsBody: { mass: 3 },
        flags: { persistent: true },
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_ansel_dish',
          plantsPl273Dish: true,
          masslineTetherable: true,
          scanLabel: 'A steaming dish, no name on it',
          swarmFloorPad: { label: 'ANSEL\u2019S DISH' },
          masslineHeat: true,
        },
      });
      if (dish && dish.id != null) {
        this._dishId = dish.id;
        this._dishNight = night;
        this._emit(PL_273_DISH_EVENT, { night, t: now });
      }
    },

    _scrapeDish(reason, now) {
      if (this._dishId == null) return;
      this.helpers?.removeEntity?.(this._dishId);
      this._dishId = null;
      this._dishScrapedNight = this._dishNight;
      this._carried = false;
      this._carriedSince = null;
      this._scrapedAt = now;
      this._cue('ui_deny', 0.5);
      if (reason === 'ordered') {
        this._popup(`plants:pl273:scraped:${Math.round(now)}`, ANSELS_DISH_TUNING.sender, SCRAPE_LINE);
        this._say('plants:pl273:scrape', 'Into the recycler.');
      }
      // The scraped-dish receipt on the station, read-only for other owners.
      const station = stationOf(this.state, ANSELS_DISH_TUNING.stationId);
      if (station?.data) station.data.plantsPl273ScrapedUntil = now + ANSELS_DISH_TUNING.dayLengthS;
      this._emit(PL_273_SCRAPED_EVENT, { reason, t: now });
    },

    _onDock(p) {
      const s = this.state;
      if (!s || !p || p.shipId == null) return;            // ignore shipId-less UI re-emits
      if (((p.stationId) || '') !== ANSELS_DISH_TUNING.stationId) return;
      if (p.shipId !== s.playerId || p.inRange !== true) return;
      // Ordering something else while it cools: an unclaimed dish is on the sill and you
      // went inside anyway.
      if (this._dishId != null && !this._carried && this._eatenNight !== this._dishNight) {
        const now = this._now();
        if (this._scrapedAt == null || now - this._scrapedAt >= ANSELS_DISH_TUNING.scrapCooldownS) {
          this._scrapeDish('ordered', now);
        }
      }
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p || this._bellId == null) return;
      const bell = [p.aId, p.bId]
        .map((id) => (id != null ? this._get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl273Bell === true);
      if (!bell) return;
      if ((Number(p.impulse) || 0) < ANSELS_DISH_TUNING.bellImpulseGate) return;
      const now = this._now();
      // One contact grind is one tap: re-fires inside the cooldown are the same hit.
      if (this._lastTapHitAt != null && now - this._lastTapHitAt < ANSELS_DISH_TUNING.tapCooldownS) return;
      this._lastTapHitAt = now;
      this._rings.push(now);
      while (this._rings.length > 4) this._rings.shift();
      const [a, b] = this._rings;
      if (this._rings.length >= 2 && b - a <= ANSELS_DISH_TUNING.knockWindowS) {
        this._rings = [];
        if (this._eatenNight === dishDayOf(now) && this._thanksNight !== dishDayOf(now)) {
          this._thanksNight = dishDayOf(now);
          this._cue('confirm', 0.45);
          this._popup(`plants:pl273:thanks:${Math.round(now)}`, ANSELS_DISH_TUNING.sender, ANSEL_LINE);
          this._emit(PL_273_THANKS_EVENT, { t: now });
        }
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== ANSELS_DISH_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, ANSELS_DISH_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = ANSELS_DISH_TUNING;
      this._ensureSill(station);
      const night = nightAt(now, t);
      const day = dishDayOf(now, t);

      // Dawn: an unclaimed dish goes back into the wash — quietly, no memory.
      if (this._lastNight === true && !night && this._dishId != null && !this._carried) {
        this.helpers?.removeEntity?.(this._dishId);
        this._dishId = null;
        this._dishScrapedNight = this._dishNight;
      }
      this._lastNight = night;

      // Cooked nightly, set on the sill — even for the regular who never came back.
      if (night && this._dishId == null && this._dishNight !== day && this._dishScrapedNight !== day) {
        this._spawnDish(station, now, day);
      }

      const dish = this._dishId != null ? this._get(this._dishId) : null;
      if (!dish || dish.alive === false) {
        this._dishId = null;
        this._carried = false;
        return;
      }
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      if (this._carried) {
        dish.pos.x = player.pos.x + 10;
        dish.pos.z = player.pos.z + 5;
        if (now - (this._carriedSince || now) >= t.eatS) {
          this.helpers?.removeEntity?.(this._dishId);
          this._dishId = null;
          this._carried = false;
          this._carriedSince = null;
          this._eatenNight = day;
          this._cue('confirm', 0.4);
          this._popup(`plants:pl273:eaten:${Math.round(now)}`, t.sender,
            'Hot, and better than it had any right to be. The bell is by the sill.');
          this._emit(PL_273_EATEN_EVENT, { night: day, t: now });
        }
        return;
      }
      const d = Math.hypot(dish.pos.x - player.pos.x, dish.pos.z - player.pos.z);
      if (night && d <= t.pickupRangeWu) {
        this._carried = true;
        this._carriedSince = now;
        this._cue('sfx_vent_chime', 0.35, 0.9);
      }
    },
  };
}

export const anselsDishPlant = createAnselsDish();
