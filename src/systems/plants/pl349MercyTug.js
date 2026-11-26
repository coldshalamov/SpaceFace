// PL-349 Io Reach — "The mercy tug. A tug stands by the launch mouth every dusk, no fee, one tow,
// first claimant | Need it once, say so; or fake stalls daily — the tug stands elsewhere at dusk,
// and dusk lasts a season | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): Io Reach is sector_io_reach / station_reach (verified in
// src/data/frontierRegions/east.js — 'station_reach' is the sector's focus). The tug exists only
// in the row, so it is a story-prop tug buoy (beacons.js story-prop shape, masslineTetherable)
// that spawns at the launch mouth during dusk — dusk is the last DUSK_FRAC of each tuning day
// (MERCY_DAY_S), dropped and respawned at the dusk boundaries. Claiming is physical: drift the
// claim ring at stall pace — "say so" is the stall itself. The tow is a bounded pull toward the
// station, no fee. First claimant is real: if another hull holds the ring, the tug serves them
// and you wait. "Fake stalls" are honest too: claiming pace means the claim ring sees a hull
// blow THROUGH it — that is the fake; three within the grace window and the tug stands
// ELSEWHERE for a season (a different, hashed berth — the mouth ring holds only a refusal and
// the line 'The tug stands elsewhere this dusk.'). The PL-09 lesson holds: no minted NPC hull.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned tug (RESET not
//   unsubscribe). Bounded per-hull ledgers (tuning.memoryCap); one tow per hull per dusk.
// - Velocity writes touch only the claiming hull; NO economy mutations ("no fee" is the point).

import { hash32 } from '../../core/rng.js';
import { queuePlayerImpulse } from './playerImpulse.js';

export const PL_349_TOWED_EVENT = 'plants:pl349:towed';
export const PL_349_BUSY_EVENT = 'plants:pl349:busy';
export const PL_349_ELSEWHERE_EVENT = 'plants:pl349:elsewhere';

export const TUG_SENDER = 'THE MERCY TUG';
export const TOWED_LINE = 'One tow. No fee.';
export const ELSEWHERE_LINE = 'The tug stands elsewhere this dusk.';

export const MERCY_TUG_TUNING = Object.freeze({
  plId: 'pl349',
  sectorId: 'sector_io_reach',
  stationId: 'station_reach',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  mouthOffsetWu: 340,
  elsewhereBearingS: 137,    // hash salt for the elsewhere berth
  elsewhereOffsetWu: 980,    // stands elsewhere: well off the launch mouth
  duskFrac: 0.25,            // the last quarter of each day is dusk
  claimRadiusWu: 90,
  claimSpeedWu: 14,          // the stall: drift in at crawl pace to say so
  towSpeedWu: 20,
  towWindowS: 14,
  fakesCap: 3,               // fake stalls before the tug moves
  fakeGraceDays: 3,
  fakeCooldownS: 30,         // distinct fakes, not one pass counted three times
  elsewhereDays: 90,         // dusk lasts a season
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: is it dusk at `now` (the tug stands by the launch mouth during dusk)? */
export function isDusk(now, tuning = MERCY_TUG_TUNING) {
  const day = tuning.MERCY_DAY_S;
  const m = ((now % day) + day) % day;
  return m >= day * (1 - tuning.duskFrac);
}

/** Pure: the tug's berth — the launch mouth, or the elsewhere berth for a season-banned hull. */
export function berthFor(stationPos, banned, tuning = MERCY_TUG_TUNING) {
  const off = banned ? tuning.elsewhereOffsetWu : tuning.mouthOffsetWu;
  const salt = banned ? tuning.elsewhereBearingS : tuning.sectorId;
  const h = hash32('plantsPl349berth', String(salt));
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * off,
    z: finite(stationPos?.z) + Math.sin(bearing) * off,
  };
}

/** Pure: is this hull season-banned (tug stands elsewhere for them)? */
export function isElsewhereFor(elsewhereUntil, hullKey, now) {
  const until = elsewhereUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl349MercyTug = {
  modes: ['flight'],
  name: 'plantsPl349',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._tugId = null;
    this._tugDuskKey = -1;
    this._tows = new Map();          // hullKey -> duskKey of last tow (bounded)
    this._towing = new Map();        // hullKey -> towUntil (bounded)
    this._fakes = new Map();         // hullKey -> { windowStart, count } (bounded)
    this._lastFakeAt = new Map();    // hullKey -> simTime of last counted fake (bounded)
    this._elsewhereUntil = new Map();// hullKey -> simTime (bounded)
    this._toldElsewhereAt = new Map();
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
    this._tows.clear();
    this._towing.clear();
    this._fakes.clear();
    this._lastFakeAt.clear();
    this._elsewhereUntil.clear();
    this._toldElsewhereAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._tows.clear();
    this._towing.clear();
    this._fakes.clear();
    this._lastFakeAt.clear();
    this._elsewhereUntil.clear();
    this._toldElsewhereAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._tugId != null) rm(this._tugId);
    this._tugId = null;
    this._tugDuskKey = -1;
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
      if (data.stationId === MERCY_TUG_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureTug(s, now, pos, banned) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || pos == null) return;
    const duskKey = Math.floor(now / (MERCY_TUG_TUNING.MERCY_DAY_S * MERCY_TUG_TUNING.duskFrac));
    if (this._tugId != null && this._tugDuskKey === duskKey && this._tugBanned === banned) return;
    if (this._tugId != null) this.helpers?.removeEntity?.(this._tugId);
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 8,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: MERCY_TUG_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: banned
          ? 'The mercy tug — standing elsewhere from the mouth tonight'
          : 'The mercy tug — no fee, one tow, first claimant, at dusk',
        storyPropKind: 'mercy_tug',
        plantsPl349Tug: true,
        lampsFlashing: true,
        lampFlashUntil: now + 1,
        swarmFloorPad: { label: banned ? 'TUG — ELSEWHERE' : 'MERCY TUG — ONE TOW' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: MERCY_TUG_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) {
      this._tugId = ent.id;
      this._tugDuskKey = duskKey;
      this._tugBanned = banned;
    }
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

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== MERCY_TUG_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    const step = this._acc;
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const now = this._now(s);
    const t = MERCY_TUG_TUNING;
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!player || player.alive === false || !player.pos) return;
    const hullKey = this._hullKey(s, player);
    const duskKey = Math.floor(now / t.MERCY_DAY_S);
    const banned = isElsewhereFor(this._elsewhereUntil, hullKey, now);
    const dusk = isDusk(now, t);
    const berth = berthFor(station.pos, banned, t);
    if (dusk) {
      this._ensureTug(s, now, berth, banned);
    } else if (this._tugId != null) {
      // The tug stands by the mouth every dusk — only at dusk.
      this.helpers?.removeEntity?.(this._tugId);
      this._tugId = null;
      this._tugDuskKey = -1;
    }

    // A tow in progress: bounded pull toward the station.
    const towUntil = this._towing.get(hullKey);
    if (Number.isFinite(towUntil) && now < towUntil) {
      // A tow in progress: a bounded pull toward the station — through the membrane
      // (the dusk tug is the visible source), never a raw vel write.
      const sx = station.pos.x - player.pos.x;
      const sz = station.pos.z - player.pos.z;
      const sd = Math.hypot(sx, sz) || 1;
      queuePlayerImpulse(s, player, (sx / sd) * t.towSpeedWu * step, (sz / sd) * t.towSpeedWu * step,
        'plantsPl349MercyTug', { continuous: true, dt: step });
    }

    if (!dusk) return;
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const mouth = berthFor(station.pos, false, t);
    const dist = Math.hypot(player.pos.x - mouth.x, player.pos.z - mouth.z);

    if (banned) {
      if (dist <= t.claimRadiusWu) {
        const last = this._toldElsewhereAt.get(hullKey) ?? -Infinity;
        if (now - last >= t.MERCY_DAY_S) {
          this._toldElsewhereAt.set(hullKey, now);
          this.bus?.emit(PL_349_ELSEWHERE_EVENT, { hullKey, refused: true, t: now });
          this._voice('plants:pl349:elsewhere', ELSEWHERE_LINE, 5);
          this._popup('plants:pl349:elsewhere', TUG_SENDER, ELSEWHERE_LINE, 6);
          this.bus?.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.4, rate: 0.9 });
        }
      }
      return;
    }
    if (dist > t.claimRadiusWu) return;

    // First claimant: if another hull holds the ring, the tug serves them.
    let busy = false;
    if (typeof s.entities?.values === 'function') {
      for (const e of s.entities.values()) {
        if (!e || e.alive === false || e.id === s.playerId || e.type !== 'ship' || !e.pos) continue;
        const d = Math.hypot(e.pos.x - mouth.x, e.pos.z - mouth.z);
        if (d <= t.claimRadiusWu) { busy = true; break; }
      }
    }
    if (busy) {
      if (now - (this._lastBusyAt ?? -Infinity) >= t.MERCY_DAY_S) {
        this._lastBusyAt = now;
        this.bus?.emit(PL_349_BUSY_EVENT, { hullKey, t: now });
      }
      return;
    }

    if (speed <= t.claimSpeedWu) {
      // Need it once, say so: the stall is the claim. One tow per dusk.
      if (this._tows.get(hullKey) === duskKey) return;
      this._tows.set(hullKey, duskKey);
      if (this._tows.size > t.memoryCap) this._tows.delete(this._tows.keys().next().value);
      this._towing.set(hullKey, now + t.towWindowS);
      this.bus?.emit(PL_349_TOWED_EVENT, { hullKey, duskKey, towUntil: now + t.towWindowS, t: now });
      this._voice('plants:pl349:towed', TOWED_LINE, 5);
      this._popup('plants:pl349:towed', TUG_SENDER, TOWED_LINE, 6);
      this.bus?.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1 });
    } else {
      // Fake stall: blowing through the claim ring at claim pace is the fake.
      const lastFake = this._lastFakeAt.get(hullKey) ?? -Infinity;
      if (now - lastFake < t.fakeCooldownS) return;
      this._lastFakeAt.set(hullKey, now);
      const rec = this._fakes.get(hullKey);
      const fake = rec && now - rec.windowStart <= t.fakeGraceDays * t.MERCY_DAY_S ? rec : { windowStart: now, count: 0 };
      fake.count += 1;
      this._fakes.set(hullKey, fake);
      if (this._fakes.size > t.memoryCap) this._fakes.delete(this._fakes.keys().next().value);
      if (fake.count >= t.fakesCap) {
        // The tug stands elsewhere at dusk, and dusk lasts a season.
        const until = now + t.elsewhereDays * t.MERCY_DAY_S;
        this._elsewhereUntil.set(hullKey, until);
        if (this._elsewhereUntil.size > t.memoryCap) this._elsewhereUntil.delete(this._elsewhereUntil.keys().next().value);
        const sd = station.data || (station.data = {});
        sd.plantsPl349Elsewhere = { hullKey, until };
        this.bus?.emit(PL_349_ELSEWHERE_EVENT, { hullKey, until, fakes: fake.count, t: now });
        this._voice('plants:pl349:elsewhere', ELSEWHERE_LINE, 5);
        this._popup('plants:pl349:elsewhere', TUG_SENDER, ELSEWHERE_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'warning', position: null, gain: 0.5, rate: 0.9 });
      }
    }
  },
};

export const pl349MercyTugPlant = pl349MercyTug;
