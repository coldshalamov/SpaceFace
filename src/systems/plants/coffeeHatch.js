// PL-274 The coffee hatch — Helios (design/program/INFERENCE_PLANTS.md, row PL-274).
// "The coffee hatch. First hull to dock before the morning bell gets a free cup in a
// clip-on mug that fits a dashboard socket."
// What the player can do: Keep the mug — refills are free for mug-bearers; or toss it,
// and every hatch starts charging you.
//
// SEAM NOTE (honest): the hatch is a chalked prop on the docking ring of the REAL Helios
// body (station_helios, sector_helios_prime). "First hull to dock before the morning bell"
// is the first real dock:range receipt (physics.js gate; shipId-less UI re-emits ignored)
// after dawn of the shared 240 s plant day. The mug is a physical payload prop that rides
// the winner's quarter; a mug-bearer gets a free refill each morning. Tossing it is a real
// impact that knocks the mug off; after that the hatch charges — NO economy writes: the
// "charge" is a denial popup, an ui_deny cue, a chalk stamp on the hatch prop, and a
// read-only receipt (data.plantsPl274ChargesHull) the economy owner may consume for real
// pricing. The hatch serves whoever docks first, hull or stranger, at one mug per morning.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; morning bell and claim day are pure
//   clock math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded memory: toss ledger Map capped at tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns owned props.
// - The durable toss receipt is flag-borne (state.story.flags.plantsPl274Tossed), like
//   every durable receipt in this family (pl199 pattern).

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_274_MUG_EVENT = 'plants:pl274:mug';
export const PL_274_REFILL_EVENT = 'plants:pl274:refill';
export const PL_274_TOSS_EVENT = 'plants:pl274:toss';
export const PL_274_CHARGE_EVENT = 'plants:pl274:charge';

export const COFFEE_HATCH_TUNING = Object.freeze({
  stationId: 'station_helios',
  sectorId: 'sector_helios_prime',
  dayLengthS: 240,
  morningFraction: 0.25,       // the morning bell: phase < 0.25
  hatchRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the hatch apron
  mugRadius: 3,
  mugFollowX: 12,
  mugFollowZ: 6,
  tossImpulseGate: 90,
  refillCooldownS: 20,
  memoryCap: 8,
  sender: 'Coffee hatch',
});

export const HATCH_SALT = 'plantsPl274Hatch';
export const MUG_LINE = 'First cup\u2019s up. Mug fits the dash socket.';
export const REFILL_LINE = 'Refill\u2019s free for the mug.';
export const CHARGE_LINE = 'Tossed mugs don\u2019t refill. It\u2019s on the slate.';

/** Morning band of the shared plant day (before the morning bell). */
export function morningAt(simTime, t = COFFEE_HATCH_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  return phase < len * t.morningFraction;
}

/** Day index of the shared plant clock. */
export function hatchDayOf(simTime, t = COFFEE_HATCH_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** The hatch: a fixed chalked spot on the docking ring, hash-derived bearing. */
export function hatchPointFor(station, t = COFFEE_HATCH_TUNING) {
  const a = (hash32(HATCH_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.hatchRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function createCoffeeHatch() {
  return {
    name: 'plantsPl274',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._hatchId = null;
      this._mugId = null;
      this._mugFor = null;         // hull id the mug rides
      this._servedDay = -1;        // day the morning cup was claimed
      this._servedHull = null;
      this._refillDay = -1;
      this._refillAt = null;
      this._lastMorning = null;
      this._tosses = new Map();    // hullId -> count, capped ledger
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
      this._tosses?.clear();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._hatchId, this._mugId]) if (id != null) rm(id);
      }
      this._hatchId = null;
      this._mugId = null;
      this._mugFor = null;
      this._servedDay = -1;
      this._servedHull = null;
      this._refillDay = -1;
      this._refillAt = null;
      this._lastMorning = null;
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

    _ensureHatch(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._hatchId != null) return;
      const point = hatchPointFor(station);
      const hatch = spawn({
        type: 'beacon',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: 6,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: COFFEE_HATCH_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_coffee_hatch',
          plantsPl274Hatch: true,
          placeId: 'place_utility_module',
          everydaySpaceKit: true,
          scanLabel: 'The coffee hatch — first hull before the morning bell drinks free',
          swarmFloorPad: { label: 'COFFEE HATCH' },
        },
      });
      this._hatchId = hatch && hatch.id != null ? hatch.id : null;
    },

    _spawnMug(stationId, hullId, now) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._mugId != null) return;
      const hull = this._get(hullId);
      const mug = spawn({
        type: 'payload',
        pos: { x: (hull?.pos.x ?? 0) + COFFEE_HATCH_TUNING.mugFollowX, z: (hull?.pos.z ?? 0) + COFFEE_HATCH_TUNING.mugFollowZ },
        vel: { x: 0, z: 0 },
        radius: COFFEE_HATCH_TUNING.mugRadius,
        mass: 1,
        physicsBody: { mass: 1 },
        flags: { persistent: true },
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_clip_mug',
          plantsPl274Mug: true,
          masslineTetherable: true,
          scanLabel: 'A clip-on mug — fits a dashboard socket',
          swarmFloorPad: { label: 'CLIP-ON MUG' },
          plantsPl274Bearer: hullId,
        },
      });
      if (mug && mug.id != null) {
        this._mugId = mug.id;
        this._mugFor = hullId;
        this._servedDay = hatchDayOf(now);
        this._servedHull = hullId;
        this._emit(PL_274_MUG_EVENT, { stationId, hullId, day: this._servedDay, t: now });
        if (hullId === this.state.playerId) {
          this._popup(`plants:pl274:mug:${Math.round(now)}`, COFFEE_HATCH_TUNING.sender, MUG_LINE);
          this._cue('confirm', 0.4);
        }
      }
    },

    _onDock(p) {
      const s = this.state;
      if (!s || !p || p.shipId == null) return;            // ignore shipId-less UI re-emits
      if (((p.stationId) || '') !== COFFEE_HATCH_TUNING.stationId || p.inRange !== true) return;
      const now = this._now();
      const t = COFFEE_HATCH_TUNING;
      if (!morningAt(now, t)) return;
      const day = hatchDayOf(now, t);
      if (this._servedDay === day) return;                 // the morning cup is claimed
      const tossed = !!(this._flags() && this._flags().plantsPl274Tossed);
      if (p.shipId === s.playerId && tossed) {
        // Every hatch starts charging you: denial + chalk + read-only receipt.
        this._popup(`plants:pl274:charge:${Math.round(now)}`, t.sender, CHARGE_LINE);
        this._cue('ui_deny', 0.5);
        const hatch = this._get(this._hatchId);
        if (hatch?.data) {
          hatch.data.swarmFloorPad = { label: 'MUG REQUIRED \u2014 ON THE SLATE' };
          hatch.data.plantsPl274ChargesHull = String(s.playerId);
        }
        this._emit(PL_274_CHARGE_EVENT, { hullId: p.shipId, day, t: now });
        this._servedDay = day; // nobody gets the free cup while your slate is up
        return;
      }
      this._spawnMug(t.stationId, p.shipId, now);
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p || this._mugId == null) return;
      const mug = [p.aId, p.bId]
        .map((id) => (id != null ? this._get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl274Mug === true);
      if (!mug) return;
      if ((Number(p.impulse) || 0) < COFFEE_HATCH_TUNING.tossImpulseGate) return;
      const now = this._now();
      // Tossed: the mug leaves the hull for good, and the hatch remembers.
      this.helpers?.removeEntity?.(this._mugId);
      this._mugId = null;
      this._mugFor = null;
      const key = String(s.playerId);
      const count = (this._tosses.get(key) || 0) + 1;
      if (this._tosses.size >= COFFEE_HATCH_TUNING.memoryCap) this._tosses.clear();
      this._tosses.set(key, count);
      const flags = this._flags();
      if (flags) flags.plantsPl274Tossed = true;
      this._cue('ui_deny', 0.5);
      this._popup(`plants:pl274:toss:${Math.round(now)}`, COFFEE_HATCH_TUNING.sender,
        'That mug was the free one. Every hatch heard it hit the deck.');
      this._emit(PL_274_TOSS_EVENT, { hullId: s.playerId, tosses: count, t: now });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== COFFEE_HATCH_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, COFFEE_HATCH_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = COFFEE_HATCH_TUNING;
      this._ensureHatch(station);
      const morning = morningAt(now, t);
      const day = hatchDayOf(now, t);

      // A new morning re-arms the free cup.
      if (this._lastMorning === false && morning && this._servedDay !== day) {
        this._servedDay = -1;
        this._servedHull = null;
      }
      this._lastMorning = morning;

      const mug = this._mugId != null ? this._get(this._mugId) : null;
      if (!mug || mug.alive === false) { this._mugId = null; return; }
      const bearer = this._mugFor != null ? this._get(this._mugFor) : null;
      if (!bearer?.pos) return;
      mug.pos.x = bearer.pos.x + t.mugFollowX;
      mug.pos.z = bearer.pos.z + t.mugFollowZ;

      // Refills are free for mug-bearers — once per morning from the day after the claim.
      if (morning && this._refillDay !== day && this._servedDay !== day
          && (this._refillAt == null || now - this._refillAt >= t.refillCooldownS)) {
        this._refillDay = day;
        this._refillAt = now;
        this._cue('sfx_vent_chime', 0.35, 1.1);
        this._emit(PL_274_REFILL_EVENT, { hullId: this._mugFor, day, t: now });
        if (this._mugFor === s.playerId) {
          this._popup(`plants:pl274:refill:${Math.round(now)}`, t.sender, REFILL_LINE);
        }
      }
    },
  };
}

export const coffeeHatchPlant = createCoffeeHatch();
