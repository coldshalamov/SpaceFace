// PL-347 Dione — "The small-hull drum. The Exchange runs a lottery drum: one free part a week,
// drawn at the bell, small hulls only | Enter fair; or enter under three hull IDs — the drum
// remembers voices, and skips yours by name | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): Dione Lane is sector_dione_lane / station_dione — the Exchange (verified
// in src/data/frontierRegions/south.js; station_dione_customs sits beside it for PL-353's
// funnel). The drum exists only in the row, so it is a story-prop post (beacons.js story-prop
// shape, swarmFloorPad label). Entering is physical: drift into the enter ring at enter pace in
// a SMALL hull — smallness is the honest hull metric (mass at or under tuning, pure
// isSmallHull). The draw happens at the bell: the first update inside a new week (WEEK_S =
// 7 x MERCY_DAY_S) draws among that week's entrants with hash32; the winner gets a REAL part —
// a payload crate by the drum, theirs to pick up the ordinary way. "Enter under three hull IDs"
// has no multi-hull seam in a single-hull sim, so the honest substitute is the same cheat's
// footprint: re-entering the ring three or more times in one week — the drum counts each
// approach as another voice. The drum remembers voices: skipped by name (a stamp and a bounded
// ledger) for a month of weeks, and draws pass it over.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned drum (RESET not
//   unsubscribe). Bounded per-week ledgers (tuning.memoryCap).
// - The prize is a crate on the ordinary route — no economy writes, no shop UI.

import { hash32 } from '../../core/rng.js';

export const PL_347_ENTERED_EVENT = 'plants:pl347:entered';
export const PL_347_DRAWN_EVENT = 'plants:pl347:drawn';
export const PL_347_SKIPPED_EVENT = 'plants:pl347:skipped';

export const DRUM_SENDER = 'THE EXCHANGE DRUM';
export const DRAWN_LINE = 'The drum draws your hull. Free part.';
export const SKIPPED_LINE = 'The drum remembers voices. Skipped by name.';

export const PL_347_PARTS = Object.freeze([
  'cmdty_comp_circuitry',
  'cmdty_microchips',
  'cmdty_control_unit',
  'cmdty_comp_hullplate',
]);

export const SMALL_HULL_DRUM_TUNING = Object.freeze({
  plId: 'pl347',
  sectorId: 'sector_dione_lane',
  stationId: 'station_dione',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  drumOffsetWu: 200,
  enterRadiusWu: 50,
  enterSpeedWu: 12,          // drift in slow to put your voice in the drum
  smallHullMassWu: 400,      // small hulls only
  weekS: 7 * 240,            // one free part a week, drawn at the bell
  skipWeeks: 4,              // a month of weeks
  entriesCap: 3,             // the third approach is one voice too many
  prizeMass: 10,
  memoryCap: 8,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the honest smallness metric — mass at or under the tuning cap. */
export function isSmallHull(ent, tuning = SMALL_HULL_DRUM_TUNING) {
  if (!ent) return false;
  const mass = Number(ent.physicsBody?.mass ?? ent.mass);
  return Number.isFinite(mass) && mass > 0 && mass <= tuning.smallHullMassWu;
}

/** Pure: the week key a simTime falls in (the drum's bell calendar). */
export function drumWeekFor(now, tuning = SMALL_HULL_DRUM_TUNING) {
  return Math.floor(finite(now) / tuning.weekS);
}

/** Pure: the drum's deterministic winner among a week's entrants. */
export function drawWinner(week, entrants) {
  const list = [...(entrants || [])];
  if (!list.length) return null;
  const h = hash32('plantsPl347draw', Math.floor(finite(week)));
  return list[h % list.length];
}

/** Pure: the prize part for a week — always a real, useful part. */
export function prizePartFor(week) {
  const w = Math.floor(finite(week));
  return PL_347_PARTS[hash32('plantsPl347part', w) % PL_347_PARTS.length];
}

/** Pure: is this hull skipped by the drum right now? */
export function isSkippedFor(skippedUntil, hullKey, now) {
  const until = skippedUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl347SmallHullDrum = {
  name: 'plantsPl347',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._drumId = null;
    this._drumWeek = -1;
    this._entries = new Map();      // week -> Set(hullKey) (bounded)
    this._approaches = new Map();   // hullKey -> { week, count } (bounded)
    this._skippedUntil = new Map(); // hullKey -> simTime (bounded)
    this._inRing = false;
    this._toldSkipAt = new Map();
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
    if (!this._unsubs) { this.state = null; this.bus = null; this.helpers = {}; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._drop();
    this._entries.clear();
    this._approaches.clear();
    this._skippedUntil.clear();
    this._toldSkipAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._entries.clear();
    this._approaches.clear();
    this._skippedUntil.clear();
    this._toldSkipAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._drumId != null) rm(this._drumId);
    this._drumId = null;
    this._drumWeek = -1;
    this._inRing = false;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _hullKey(s, ent) {
    return String(ent?.id ?? s?.playerId ?? 'unknown');
  },

  _station(s) {
    const entities = s?.entities;
    if (!entities) return null;
    const list = typeof entities.values === 'function' ? [...entities.values()] : (Array.isArray(entities) ? entities : []);
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      const data = e.data || {};
      if (data.isGate === true || data.isWormhole === true) continue;
      if (data.stationId === SMALL_HULL_DRUM_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureDrum(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const h = hash32('plantsPl347drum', SMALL_HULL_DRUM_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * SMALL_HULL_DRUM_TUNING.drumOffsetWu,
      z: station.pos.z + Math.sin(bearing) * SMALL_HULL_DRUM_TUNING.drumOffsetWu,
    };
    if (this._drumId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 6,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: SMALL_HULL_DRUM_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The small-hull drum — one free part a week, drawn at the bell',
        storyPropKind: 'exchange_lottery_drum',
        plantsPl347Drum: true,
        lampsFlashing: true,
        lampFlashUntil: now + 1,
        swarmFloorPad: { label: 'THE DRUM — SMALL HULLS' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: SMALL_HULL_DRUM_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._drumId = ent.id;
    return pos;
  },

  _voice(id, text, ttl = 5) {
    if (this.helpers?.voice && typeof this.helpers.voice.say === 'function') {
      this.helpers.voice.say({ channel: 'comms', id, text, kind: 'traffic', ttl });
    } else {
      this.bus?.emit('voice:say', { channel: 'comms', id, text, ttl });
    }
  },

  _popup(id, sender, text, ttl = 6) {
    this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
  },

  _draw(s, now, week, pos) {
    const t = SMALL_HULL_DRUM_TUNING;
    const entrants = this._entries.get(week - 1);
    const winner = drawWinner(week - 1, entrants);
    this._entries.delete(week - 1);
    if (!winner) return;
    const part = prizePartFor(week - 1);
    const spawn = this.helpers?.spawnEntity;
    let prizeId = null;
    if (typeof spawn === 'function' && pos) {
      const crate = spawn({
        type: 'payload',
        pos: { x: pos.x + 16, z: pos.z + 6 },
        vel: { x: 0, z: 0 },
        radius: 6,
        mass: t.prizeMass,
        hull: 20,
        hullMax: 20,
        physicsBody: { mass: t.prizeMass },
        flags: { persistent: true },
        homeSectorId: t.sectorId,
        data: {
          masslineTetherable: true,
          scanLabel: `The drum's draw — one free part (${part.replace('cmdty_', '').replace(/_/g, ' ')})`,
          plantsPl347Prize: { week: week - 1, winner, commodityId: part },
          swarmFloorPad: { label: 'THE DRUM\'S DRAW' },
          homeSectorId: t.sectorId,
        },
      });
      if (crate && crate.id != null) prizeId = crate.id;
    }
    this.bus?.emit(PL_347_DRAWN_EVENT, { week: week - 1, winner, part, prizeId, t: now });
    const playerKey = String(s.playerId);
    if (winner === playerKey) {
      this._voice('plants:pl347:drawn', DRAWN_LINE, 5);
      this._popup('plants:pl347:drawn', DRUM_SENDER, DRAWN_LINE, 6);
      this.bus?.emit('audio:cue', { id: 'confirm', position: pos ? { x: pos.x, z: pos.z } : null, gain: 0.6, rate: 1 });
    }
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== SMALL_HULL_DRUM_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const pos = this._ensureDrum(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = SMALL_HULL_DRUM_TUNING;
    const hullKey = this._hullKey(s, player);
    const week = drumWeekFor(now, t);
    if (week !== this._drumWeek) {
      this._drumWeek = week;
      this._draw(s, now, week, pos);   // drawn at the bell
    }
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    if (dist > t.enterRadiusWu) { this._inRing = false; return; }
    if (speed > t.enterSpeedWu) return;

    if (isSkippedFor(this._skippedUntil, hullKey, now)) {
      const last = this._toldSkipAt.get(hullKey) ?? -Infinity;
      if (now - last >= t.MERCY_DAY_S) {
        this._toldSkipAt.set(hullKey, now);
        this.bus?.emit(PL_347_SKIPPED_EVENT, { hullKey, refused: true, t: now });
        this._voice('plants:pl347:skipped', SKIPPED_LINE, 5);
        this._popup('plants:pl347:skipped', DRUM_SENDER, SKIPPED_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 0.9 });
      }
      return;
    }
    if (!isSmallHull(player, t)) return;   // small hulls only

    // Enter fair: one voice per approach — the ring counts on re-entry, not per tick.
    if (this._inRing) return;
    this._inRing = true;
    const rec = this._approaches.get(hullKey);
    const entry = rec && rec.week === week ? rec : { week, count: 0 };
    entry.count += 1;
    this._approaches.set(hullKey, entry);
    if (this._approaches.size > t.memoryCap) this._approaches.delete(this._approaches.keys().next().value);
    if (entry.count >= t.entriesCap) {
      // Enter under three hull IDs: the drum remembers voices, and skips yours by name.
      const until = now + t.skipWeeks * t.weekS;
      this._skippedUntil.set(hullKey, until);
      if (this._skippedUntil.size > t.memoryCap) this._skippedUntil.delete(this._skippedUntil.keys().next().value);
      const sd = station.data || (station.data = {});
      sd.plantsPl347Skipped = hullKey;
      this.bus?.emit(PL_347_SKIPPED_EVENT, { hullKey, approaches: entry.count, until, t: now });
      this._voice('plants:pl347:skipped', SKIPPED_LINE, 5);
      this._popup('plants:pl347:skipped', DRUM_SENDER, SKIPPED_LINE, 6);
      this.bus?.emit('audio:cue', { id: 'warning', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 0.9 });
      return;
    }
    let set = this._entries.get(week);
    if (!set) { set = new Set(); this._entries.set(week, set); }
    if (this._entries.size > t.memoryCap) this._entries.delete(this._entries.keys().next().value);
    const first = !set.has(hullKey);
    set.add(hullKey);
    if (first) {
      this.bus?.emit(PL_347_ENTERED_EVENT, { hullKey, week, entries: entry.count, t: now });
      this.bus?.emit('audio:cue', { id: 'confirm', position: { x: pos.x, z: pos.z }, gain: 0.35, rate: 1.2 });
    }
  },
};

export const pl347SmallHullDrumPlant = pl347SmallHullDrum;
