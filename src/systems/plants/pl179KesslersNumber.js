// PL-179 Kessler's number — Tethys (design/program/INFERENCE_PLANTS.md, row PL-179).
// "Kessler's number. The window over the Scale is lit at any hour. Park on the Scale at
// night, empty, and the board flips to your exact weight, and Kessler reads it aloud,
// once, from the dark."
// What the player can do: Learn your number — you will know when you are carrying
// something extra.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The Scale is the REAL Scale: KESSLER_SCALE.pad / padRadius / restSpeed from
//   src/data/kessler.js (the weigh-slip deck at Tethys). This module adds no prop and
//   moves nothing — it reads the player's true rest on the plate.
// - Night is the fixed sim-clock band; "once" is once per yard night (day-index cooldown).
// - "Empty" is the player's real hold (state.player.cargo.items with no units).
// - The exact italic copy is Kessler's read, spoken once on the ambient voice channel
//   (priority 1 — the stationBroadcast convention); the board flip itself is a comms
//   popup carrying the measured tonnage.
// - Learned numbers persist in story flags (plantsPl179NumberT) so the "something extra"
//   read works across sessions like every other flag-borne receipt.
// - No entity spawns; destroy() unsubscribes all and resets session state.

import { KESSLER_SCALE } from '../../data/kessler.js';

export const PL_179_NUMBER_EVENT = 'plants:pl179:number';
export const PL_179_EXTRA_EVENT = 'plants:pl179:somethingExtra';

export const PL_179_LEARNED_FLAG = 'plantsPl179LearnedNumber';
export const PL_179_READ_LINE = 'Learn your number — you will know when you are carrying something extra';

export const KESSLERS_NUMBER_TUNING = Object.freeze({
  dayLengthS: 240,
  nightFraction: 0.25,        // night: the last 60 s of each yard day
  restGraceS: 2,              // parked, not drifting
  fallbackHullT: 10,          // a hull without a mass field still reads a number
  memoryCap: 4,
});

export function isNightAt(simTime, t = KESSLERS_NUMBER_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  return phase >= len * (1 - t.nightFraction);
}

/** The board's exact weight: hull mass in tonnes, read to a tenth. */
export function boardWeightOf(entity, t = KESSLERS_NUMBER_TUNING) {
  const m = entity && Number.isFinite(entity.mass) && entity.mass > 0 ? entity.mass : t.fallbackHullT;
  return Math.round(m * 10) / 10;
}

export function carriedUnitsOf(player) {
  const items = player && player.cargo && player.cargo.items;
  if (!items || typeof items !== 'object') return 0;
  let sum = 0;
  for (const key of Object.keys(items)) {
    const it = items[key];
    if (!it) continue;
    const n = Number(it.amount != null ? it.amount : it.qty != null ? it.qty : it);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

export function createPl179KesslersNumber() {
  return {
    name: 'plantsPl179',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._restSince = null;
      this._lastReadNightKey = null;   // `${dayIndex}` — one read per night
      this._lastExtraNightKey = null;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => { this._restSince = null; });
      on('save:loaded', () => { this._restSince = null; });
      on('game:newGame', () => { this._restSince = null; this._lastReadNightKey = null; });
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._restSince = null;
      this._accum = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 8) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('comms:popup', { id, sender, category: 'info', text, ttl, persist: false });
    },

    _voice(id, text, ttl = 10) {
      const say = this.helpers && this.helpers.voice && this.helpers.voice.say;
      if (typeof say === 'function') {
        say({ id, channel: 'ambient', priority: 1, text, ttl });
        return;
      }
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('voice:say', { id, channel: 'ambient', priority: 1, text, ttl });
      }
    },

    _emit(type, payload) {
      if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(type, payload);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if ((s.world && s.world.currentSectorId) !== KESSLER_SCALE.sectorId) { this._accum = 0; return; }

      this._accum += Math.max(0, Number(dt) || 0);
      if (this._accum < 1) return;             // 1 Hz — a scale reads at human pace
      this._accum = 0;

      const now = this._now();
      const player = s.entities && typeof s.entities.get === 'function' ? s.entities.get(s.playerId) : null;
      if (!player || !player.pos) return;

      // Parked ON the Scale: the real plate radius and rest speed from the scale owner.
      const d = Math.hypot(player.pos.x - KESSLER_SCALE.pad.x, player.pos.z - KESSLER_SCALE.pad.z);
      const speed = player.vel ? Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0) : 0;
      const parked = d <= KESSLER_SCALE.padRadius && speed <= KESSLER_SCALE.restSpeed;
      this._restSince = parked && this._restSince == null ? now : (!parked ? null : this._restSince);
      if (!parked || this._restSince == null || now - this._restSince < KESSLERS_NUMBER_TUNING.restGraceS) return;
      if (!isNightAt(now)) return;

      const len = Math.max(1, KESSLERS_NUMBER_TUNING.dayLengthS);
      const dayIndex = Math.floor(now / len);
      const carried = carriedUnitsOf(s.player);
      const empty = carried <= 0;

      if (empty && this._lastReadNightKey !== `${dayIndex}`) {
        // The board flips to your exact weight; Kessler reads it aloud, once, from the dark.
        this._lastReadNightKey = `${dayIndex}`;
        const weightT = boardWeightOf(player);
        const flags = s.story && s.story.flags ? s.story.flags : null;
        if (flags) flags[PL_179_LEARNED_FLAG] = true;
        this._popup(`plants:pl179:board:${Math.round(now)}`, KESSLER_SCALE.sender,
          `The window over the Scale is lit. The board flips: ${weightT} t, dead empty.`, 9);
        this._voice(`plants:pl179:read:${Math.round(now)}`, PL_179_READ_LINE, 10);
        this._emit(PL_179_NUMBER_EVENT, { weightT, t: now });
        return;
      }
      if (!empty && flags(s).learned && this._lastExtraNightKey !== `${dayIndex}`) {
        // You know your number, so you know when you are carrying something extra.
        this._lastExtraNightKey = `${dayIndex}`;
        const hullT = boardWeightOf(player);
        const extraT = Math.round(carried * 10) / 10;
        this._popup(`plants:pl179:extra:${Math.round(now)}`, KESSLER_SCALE.sender,
          `The board flips: ${hullT} t on an empty ${hullT} t hull — ${extraT} t of something extra.`, 9);
        this._emit(PL_179_EXTRA_EVENT, { hullT, extraT, t: now });
      }
    },
  };
}

// Small local reader so the flag check never assumes the story bag exists.
function flags(state) {
  const f = state && state.story && state.story.flags;
  return { learned: !!(f && f[PL_179_LEARNED_FLAG]) };
}

export const pl179KesslersNumber = createPl179KesslersNumber();
