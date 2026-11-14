// PL-284 The night bell — Pallas (design/program/INFERENCE_PLANTS.md, row PL-284).
// "The night bell. Ring the bell at the mission berth and a pallet comes out inside a
// minute — blanket, hot pack, no questions."
// What the player can do: Ring it when you need it; or ring it as a joke — the bell comes
// down, and the pallet stops coming.
//
// SEAM NOTE (honest): the mission berth is the docking ring of the REAL Drift Market body
// (station_drift, sector_pallas_drift); the bell is a physical prop at a fixed hash
// bearing. Ringing is two real physics impacts inside the knock window (the pl200 knock
// vocabulary). "When you need it" is a real read: night band of the shared 240 s plant
// day, or a hull below half. The pallet is a payload prop that arrives tuning.palletS
// after the ring ("inside a minute"), hot-pack label, no questions asked, one per night.
// The joke is real too: ringing again while a pallet is already out or incoming — or
// ringing three times inside a minute for no reason — rings the bell down: the prop is
// removed, an empty bracket chalk takes its place, and the flag-borne receipt
// (state.story.flags.plantsPl284BellDown) means no pallet, ever, for this session.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; night band, pallet due times and the
//   ring ledger are pure clock math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded ring ledger capped at tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns bell, pallet, bracket.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_284_RING_EVENT = 'plants:pl284:ring';
export const PL_284_PALLET_EVENT = 'plants:pl284:pallet';
export const PL_284_JOKE_EVENT = 'plants:pl284:joke';
export const PL_284_DOWN_EVENT = 'plants:pl284:down';

export const NIGHT_BELL_TUNING = Object.freeze({
  stationId: 'station_drift',
  sectorId: 'sector_pallas_drift',
  dayLengthS: 240,
  nightFraction: 0.25,         // "night" of the shared plant day
  berthRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the mission berth apron
  palletS: 45,                 // inside a minute
  palletTakeRangeWu: 20,
  palletTakeS: 3,
  bellImpulseGate: 60,
  knockWindowS: 3,
  ringCooldownS: 0.7,          // one contact grind is one ring: frames inside this are the same hit
  jokeRepeatS: 20,             // a second ring this soon, with a pallet out, is a joke
  memoryCap: 12,
});

export const BELL_SALT = 'plantsPl284Bell';
export const PALLET_LABEL = 'BLANKET & HOT PACK';
export const DOWN_LINE = 'Bell comes down. Somebody rang it for nothing.';

/** Night band of the shared plant day. */
export function nightAt(simTime, t = NIGHT_BELL_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  return phase >= len * (1 - t.nightFraction);
}

/** Day index of the shared plant clock. */
export function bellDayOf(simTime, t = NIGHT_BELL_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** The mission berth's bell spot: a fixed chalked spot, hash-derived bearing. */
export function bellPointFor(station, t = NIGHT_BELL_TUNING) {
  const a = (hash32(BELL_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.berthRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function createNightBell() {
  return {
    name: 'plantsPl284',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._bracketId = null;
      this._bellId = null;
      this._palletId = null;
      this._bellPoint = null;
      this._rings = [];
      this._lastBellHitAt = null;
      this._ringDay = -1;
      this._palletDueAt = null;
      this._takeSince = null;
      this._down = false;
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
      this._down = !!(this.state?.story?.flags?.plantsPl284BellDown);
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._bracketId, this._bellId, this._palletId]) {
          if (id != null) rm(id);
        }
      }
      this._bracketId = null;
      this._bellId = null;
      this._palletId = null;
      this._bellPoint = null;
      this._rings = [];
      this._lastBellHitAt = null;
      this._ringDay = -1;
      this._palletDueAt = null;
      this._takeSince = null;
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

    _needed(now, player) {
      const hullMax = Number.isFinite(player?.hullMax) && player.hullMax > 0 ? player.hullMax : Math.max(1, player?.hull || 1);
      const frac = Number.isFinite(player?.hull) ? player.hull / hullMax : 1;
      return nightAt(now, NIGHT_BELL_TUNING) || frac <= 0.5;
    },

    _ensureBell(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const point = bellPointFor(station);
      this._bellPoint = point;
      if (this._bracketId == null) {
        const bracket = spawn({
          type: 'beacon',
          pos: { x: point.x, z: point.z },
          vel: { x: 0, z: 0 },
          radius: 5,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: NIGHT_BELL_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_bell_bracket',
            plantsPl284Bracket: true,
            scanLabel: this._down
              ? 'The mission berth \u2014 the bell bracket is empty now'
              : 'The mission berth \u2014 a bell hangs here for whoever needs it',
            swarmFloorPad: { label: this._down ? 'BELL TAKEN DOWN' : 'MISSION BERTH' },
          },
        });
        this._bracketId = bracket && bracket.id != null ? bracket.id : null;
      }
      if (!this._down && this._bellId == null) {
        const bell = spawn({
          type: 'beacon',
          pos: { x: point.x + 6, z: point.z + 2 },
          vel: { x: 0, z: 0 },
          radius: 4,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: NIGHT_BELL_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_night_bell',
            plantsPl284Bell: true,
            scanLabel: 'The night bell \u2014 ring it when you need it, pallet inside a minute',
            swarmFloorPad: { label: 'NIGHT BELL' },
          },
        });
        this._bellId = bell && bell.id != null ? bell.id : null;
      }
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p || this._down || this._bellId == null) return;
      const bell = [p.aId, p.bId]
        .map((id) => (id != null ? this._get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl284Bell === true);
      if (!bell) return;
      if ((Number(p.impulse) || 0) < NIGHT_BELL_TUNING.bellImpulseGate) return;
      const now = this._now();
      const t = NIGHT_BELL_TUNING;
      // One contact grind is one ring: re-fires inside the cooldown are the same hit,
      // ignored entirely — never counted as a second ring, never a joke.
      if (this._lastBellHitAt != null && now - this._lastBellHitAt < t.ringCooldownS) return;
      this._lastBellHitAt = now;
      this._rings.push(now);
      while (this._rings.length > t.memoryCap) this._rings.shift();
      const [a, b] = this._rings;
      if (!(this._rings.length >= 2 && b - a <= t.knockWindowS)) return;
      this._rings = [];
      const day = bellDayOf(now, t);
      const player = this._get(s.playerId);

      // Ringing as a joke: a pallet already out or incoming, or a repeat ring this soon.
      const joking = this._palletId != null || this._palletDueAt != null
        || (this._ringDay === day && now - (this._lastRingAt || 0) < t.jokeRepeatS);
      this._lastRingAt = now;
      if (joking) {
        this._takeBellDown(now, 'joke');
        return;
      }
      this._ringDay = day;
      this._neededAtRing = this._needed(now, player);
      this._palletDueAt = now + t.palletS;
      this._cue('sfx_vent_chime', 0.5, 0.7);
      this._emit(PL_284_RING_EVENT, { day, needed: this._neededAtRing, t: now });
    },

    _takeBellDown(now, reason) {
      this._down = true;
      const flags = this._flags();
      if (flags) flags.plantsPl284BellDown = true;
      if (this._bellId != null) this.helpers?.removeEntity?.(this._bellId);
      this._bellId = null;
      this._palletDueAt = null;
      const bracket = this._get(this._bracketId);
      if (bracket?.data) {
        bracket.data.swarmFloorPad = { label: 'BELL TAKEN DOWN' };
        bracket.data.scanLabel = 'The mission berth \u2014 the bell bracket is empty now';
      }
      this._cue('ui_deny', 0.5);
      this._popup(`plants:pl284:down:${Math.round(now)}`, 'The mission berth', DOWN_LINE);
      this._emit(PL_284_DOWN_EVENT, { reason, t: now });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== NIGHT_BELL_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, NIGHT_BELL_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      this._ensureBell(station);
      if (this._down) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      // The pallet comes out inside a minute — blanket, hot pack, no questions.
      if (this._palletDueAt != null && now >= this._palletDueAt) {
        this._palletDueAt = null;
        const spawn = this.helpers?.spawnEntity;
        if (typeof spawn !== 'function' || !this._bellPoint) return;
        const pallet = spawn({
          type: 'payload',
          pos: { x: this._bellPoint.x + 16, z: this._bellPoint.z + 8 },
          vel: { x: 0, z: 0 },
          radius: 5,
          mass: 4,
          physicsBody: { mass: 4 },
          flags: { persistent: true },
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_night_pallet',
            plantsPl284Pallet: true,
            masslineTetherable: true,
            scanLabel: 'A pallet rolled out for you \u2014 blanket, hot pack, no questions',
            swarmFloorPad: { label: PALLET_LABEL },
          },
        });
        if (pallet && pallet.id != null) {
          this._palletId = pallet.id;
          this._cue('confirm', 0.4);
          this._emit(PL_284_PALLET_EVENT, { palletId: pallet.id, t: now });
        }
        return;
      }

      // Taking the pallet: it is yours, quietly.
      const pallet = this._palletId != null ? this._get(this._palletId) : null;
      if (!pallet || pallet.alive === false) { this._palletId = null; this._takeSince = null; return; }
      const d = Math.hypot(pallet.pos.x - player.pos.x, pallet.pos.z - player.pos.z);
      if (d <= NIGHT_BELL_TUNING.palletTakeRangeWu) {
        if (this._takeSince == null) this._takeSince = now;
        if (now - this._takeSince >= NIGHT_BELL_TUNING.palletTakeS) {
          this.helpers?.removeEntity?.(this._palletId);
          player.data = player.data || {};
          player.data.plantsPl284Pallet = true;
          this._palletId = null;
          this._takeSince = null;
          this._cue('confirm', 0.35);
          this._emit(PL_284_PALLET_EVENT, { taken: true, t: now });
        }
      } else {
        this._takeSince = null;
      }
    },
  };
}

export const nightBellPlant = createNightBell();
