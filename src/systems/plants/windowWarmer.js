// PL-280 The window warmer — Vesta (design/program/INFERENCE_PLANTS.md, row PL-280).
// "The window warmer. Dock late, after the windows go dark, and one clerk stays open an
// extra minute for late hulls — fines, fuel, either."
// What the player can do: Get in before they close it; or keep them late on purpose —
// that window closes for good, and the clerk remembers the hull.
//
// SEAM NOTE (honest): the window is a chalked prop on the docking ring of the REAL Vesta
// foundry (station_forge, sector_vesta_forge). At night (last quarter of the shared 240 s
// plant day) every window is dark except this one: its lamp stays lit for an extra
// tuning.lateWindowS and serves a late hull through the real dock:range gate. "Fines,
// fuel, either" is physical, not credits: a low hull gets the fuel answer (a real vent
// cue and a stamp), anything else gets the fine answer (the lamp flashes twice for the
// clerk's receipt). Keeping them late on purpose is loitering at the dark window after
// close: do it on two distinct nights (bounded, keyed hull+station) and the window closes
// for good — lamp out, label CLOSED, flag-borne receipt, and the clerk remembers the hull
// via the read-only stamp data.plantsPl280ClosedForHull.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; night band, late window and the
//   nights ledger are pure clock math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns the window prop.
// - NO economy writes: a served late hull gets cues and stamps, never credits mutations.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_280_OPEN_EVENT = 'plants:pl280:open';
export const PL_280_SERVED_EVENT = 'plants:pl280:served';
export const PL_280_LATE_EVENT = 'plants:pl280:late';
export const PL_280_CLOSED_EVENT = 'plants:pl280:closed';

export const WINDOW_WARMER_TUNING = Object.freeze({
  stationId: 'station_forge',
  sectorId: 'sector_vesta_forge',
  dayLengthS: 240,
  nightFraction: 0.25,         // last quarter: the windows are dark
  lateWindowS: 30,             // one clerk stays open this much longer
  windowRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the dock face
  loiterS: 10,                 // dwell at the dark window that counts as keeping them late
  lateNightsForBite: 2,
  fuelHullFraction: 0.5,
  memoryCap: 8,
  sender: 'The late clerk',
});

export const WINDOW_SALT = 'plantsPl280Window';
export const SERVED_FUEL_LINE = 'Fuel\u2019s on. Go home warm.';
export const SERVED_FINE_LINE = 'Fine\u2019s paid. Now go home.';
export const CLOSED_LINE = 'The clerk goes home. The window goes dark.';

/** Night band of the shared plant day. */
export function nightAt(simTime, t = WINDOW_WARMER_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  return phase >= len * (1 - t.nightFraction);
}

/** Seconds elapsed inside the night band. */
export function nightElapsedS(simTime, t = WINDOW_WARMER_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  const start = len * (1 - t.nightFraction);
  return phase >= start ? phase - start : 0;
}

/** Day index of the shared plant clock. */
export function warmerNightOf(simTime, t = WINDOW_WARMER_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** The window's fixed spot on the dock face, hash-derived bearing. */
export function windowPointFor(station, t = WINDOW_WARMER_TUNING) {
  const a = (hash32(WINDOW_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.windowRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

/** Pure read: is the warmer still open at this point of the night? */
export function warmerOpenAt(simTime, t = WINDOW_WARMER_TUNING) {
  return nightAt(simTime, t) && nightElapsedS(simTime, t) <= t.lateWindowS;
}

export function createWindowWarmer() {
  return {
    name: 'plantsPl280',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._windowId = null;
      this._windowPoint = null;
      this._servedNight = -1;
      this._loiterS = 0;
      this._lateNights = new Map(); // hull@station -> Set of nights, capped
      this._closedForGood = false;
      this._lastNight = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
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
      this._lateNights?.clear();
      this._closedForGood = !!(this.state?.story?.flags?.plantsPl280ClosedForGood);
    },

    _drop() {
      if (this._windowId != null) this.helpers?.removeEntity?.(this._windowId);
      this._windowId = null;
      this._windowPoint = null;
      this._servedNight = -1;
      this._loiterS = 0;
      this._lastNight = null;
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

    _ensureWindow(station, now) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._windowId != null) return;
      const point = windowPointFor(station);
      this._windowPoint = point;
      const open = this._closedForGood ? false : warmerOpenAt(now);
      const win = spawn({
        type: 'beacon',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: 7,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: WINDOW_WARMER_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_warm_window',
          plantsPl280Window: true,
          placeId: 'place_observation_blister',
          everydaySpaceKit: true,
          scanLabel: this._closedForGood
            ? 'The fine & fuel window \u2014 CLOSED, and the clerk remembers your hull'
            : 'The fine & fuel window \u2014 dark everywhere else, this one still lit',
          swarmFloorPad: { label: this._closedForGood ? 'CLOSED \u2014 STAYED LATE' : 'FINE & FUEL \u2014 OPEN LATE' },
          lampsFlashing: open,
          lampFlashUntil: open ? now + WINDOW_WARMER_TUNING.lateWindowS : now,
        },
      });
      this._windowId = win && win.id != null ? win.id : null;
      if (open) this._emit(PL_280_OPEN_EVENT, { until: now + WINDOW_WARMER_TUNING.lateWindowS, t: now });
    },

    _serveLate(hullId, now) {
      const day = warmerNightOf(now);
      if (this._servedNight === day) return;
      const player = this._get(hullId);
      const hullMax = Number.isFinite(player?.hullMax) && player.hullMax > 0 ? player.hullMax : Math.max(1, player?.hull || 1);
      const frac = Number.isFinite(player?.hull) ? player.hull / hullMax : 1;
      const fuel = frac <= WINDOW_WARMER_TUNING.fuelHullFraction;
      this._servedNight = day;
      if (player?.data) player.data.plantsPl280ServedAt = now;
      const win = this._get(this._windowId);
      if (win?.data) win.data.lampFlashUntil = now + 3;
      this._cue('confirm', 0.45);
      this._popup(`plants:pl280:served:${Math.round(now)}`, WINDOW_WARMER_TUNING.sender,
        fuel ? SERVED_FUEL_LINE : SERVED_FINE_LINE);
      this._emit(PL_280_SERVED_EVENT, { hullId, answer: fuel ? 'fuel' : 'fine', night: day, t: now });
    },

    _onDock(p) {
      const s = this.state;
      if (!s || !p || p.shipId == null) return;            // ignore shipId-less UI re-emits
      if (((p.stationId) || '') !== WINDOW_WARMER_TUNING.stationId || p.inRange !== true) return;
      if (p.shipId !== s.playerId) return;
      const now = this._now();
      const t = WINDOW_WARMER_TUNING;
      if (this._closedForGood) {
        this._cue('ui_deny', 0.4);
        this._popup(`plants:pl280:shut:${Math.round(now)}`, t.sender,
          'That window\u2019s dark. It remembers why.');
        return;
      }
      // Get in before they close it.
      if (warmerOpenAt(now, t)) this._serveLate(p.shipId, now);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== WINDOW_WARMER_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, WINDOW_WARMER_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = WINDOW_WARMER_TUNING;
      this._ensureWindow(station, now);
      if (!this._windowPoint) return;
      const night = nightAt(now, t);
      if (this._lastNight === true && !night) this._servedNight = -1; // a fresh night re-arms
      this._lastNight = night;

      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      if (this._closedForGood) return;
      const open = warmerOpenAt(now, t);
      const win = this._get(this._windowId);
      if (win?.data) win.data.lampsFlashing = open;

      // Keep them late on purpose: loitering at the dark window after close.
      const d = Math.hypot(player.pos.x - this._windowPoint.x, player.pos.z - this._windowPoint.z);
      if (night && !open && d <= 30) {
        this._loiterS += Math.max(0, Number(dt) || 0);
        if (this._loiterS >= t.loiterS) {
          this._loiterS = 0;
          const night2 = warmerNightOf(now, t);
          const key = `${s.playerId}@${t.stationId}`;      // social memory: hull + station
          let nights = this._lateNights.get(key);
          if (!nights) {
            if (this._lateNights.size >= t.memoryCap) this._lateNights.clear();
            nights = new Set();
            this._lateNights.set(key, nights);
          }
          nights.add(night2);
          this._cue('ui_deny', 0.4);
          this._emit(PL_280_LATE_EVENT, { night: night2, nights: nights.size, t: now });
          if (nights.size >= t.lateNightsForBite) {
            this._closedForGood = true;
            const flags = this._flags();
            if (flags) flags.plantsPl280ClosedForGood = true;
            if (win?.data) {
              win.data.lampsFlashing = false;
              win.data.lampFlashUntil = now;
              win.data.swarmFloorPad = { label: 'CLOSED \u2014 STAYED LATE' };
              win.data.plantsPl280ClosedForHull = String(s.playerId); // the clerk remembers
            }
            this._popup(`plants:pl280:closed:${Math.round(now)}`, t.sender, CLOSED_LINE);
            this._emit(PL_280_CLOSED_EVENT, { hullId: s.playerId, night: night2, t: now });
          }
        }
      } else if (d > 30) {
        this._loiterS = 0;
      }
    },
  };
}

export const windowWarmerPlant = createWindowWarmer();
