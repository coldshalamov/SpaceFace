// PL-352 Ashfall Reach — "The chalked name. The keykeeper chalks one name a week for a free gate
// service, drawn from whoever was seen helping around the station | Help and wait for the chalk;
// or nominate yourself — the chalk never lands on nominees, and everyone knows why |
// DRAFT 2026-11-13"
//
// SEAM NOTE (honest): Ashfall Reach is sector_ashfall_reach / station_ashcache (verified in
// src/data/postEndingReplayChains.js and sectorActivityPockets.js — 'station_ashcache' is the
// reach's working station). The chalk post exists only in the row, so it is a story-prop post
// (beacons.js story-prop shape, swarmFloorPad label). "Seen helping" needs an observable act:
// the honest seam is a damaged or stalled civilian hull near you inside the station's sight
// while you hold position beside it for the help-hold window — you stopped for somebody, in
// sight of the station. The chalk lands at the week bell (WEEK_S = 7 x MERCY_DAY_S): one name
// drawn from that week's seen set with hash32. The "free gate service" has no economy seam to
// waive (gate fees are another writer's), so the courtesy is paid IN KIND and stamped: dock
// lamps flash welcome once, a free courtesy patch (the PL-143 outside-dock shape) once for the
// chalked week, and station.data.plantsPl352Chalk carries the name — ECONOMY-OWNER HANDOFF: an
// economy owner can read that stamp and waive its gate fee for the chalked week without this
// plant inventing the waiver. Nominating yourself is physical: dwell in the post's nominate
// ring for the hold window. The chalk never lands on nominees, and everyone knows why: the
// nominee stamp rides the hull and the station names the reason.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned post (RESET not
//   unsubscribe). Bounded per-week ledgers (tuning.memoryCap); one patch per chalked week.
// - NO economy mutations; the waiver is documented as a stamp handoff, not simulated.

import { hash32 } from '../../core/rng.js';

export const PL_352_SEEN_EVENT = 'plants:pl352:seen';
export const PL_352_CHALKED_EVENT = 'plants:pl352:chalked';
export const PL_352_NOMINATED_EVENT = 'plants:pl352:nominated';

export const KEYKEEPER_SENDER = 'THE KEYKEEPER';
export const CHALKED_LINE = "Your name's chalked. Gate's free.";
export const NOMINATED_LINE = 'Chalk never lands on nominees.';

export const CHALKED_NAME_TUNING = Object.freeze({
  plId: 'pl352',
  sectorId: 'sector_ashfall_reach',
  stationId: 'station_ashcache',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  postOffsetWu: 210,
  sightRadiusWu: 420,        // "around the station" — the keykeeper's sight
  helpRadiusWu: 120,         // the needy hull must be this near you
  helpHoldS: 10,             // hold position beside them this long to be seen
  needyHullFrac: 0.7,        // damaged (or stalled below needySpeedWu) counts as needing
  needySpeedWu: 8,
  nominateRadiusWu: 40,
  nominateHoldS: 12,         // dwelling this long at the post is nominating yourself
  courtesyHull: 8,
  weekS: 7 * 240,            // one name a week
  memoryCap: 8,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the week key a simTime falls in (the keykeeper's chalk calendar). */
export function chalkWeekFor(now, tuning = CHALKED_NAME_TUNING) {
  return Math.floor(finite(now) / tuning.weekS);
}

/** Pure: the chalk's deterministic draw among a week's seen hulls. */
export function drawChalkName(week, seenHulls) {
  const list = [...(seenHulls || [])];
  if (!list.length) return null;
  const h = hash32('plantsPl352chalk', Math.floor(finite(week)));
  return list[h % list.length];
}

/** Pure: does this civilian hull need help right now? */
export function needsHelp(ent, tuning = CHALKED_NAME_TUNING) {
  if (!ent) return false;
  const hull = finite(ent.hull, -1);
  const hullMax = finite(ent.hullMax, 0);
  const dented = hull >= 0 && hullMax > 0 && hull < hullMax * tuning.needyHullFrac;
  const stalled = Math.hypot(finite(ent.vel?.x), finite(ent.vel?.z)) <= tuning.needySpeedWu;
  return dented || stalled;
}

/** Pure: is this hull a nominee right now? */
export function isNominee(nomineeUntil, hullKey, now) {
  const until = nomineeUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl352ChalkedName = {
  name: 'plantsPl352',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._postId = null;
    this._postIdWeek = -1;
    this._seen = new Map();         // week -> Set(hullKey) (bounded)
    this._helpHold = new Map();     // hullKey -> seconds held this week (bounded)
    this._seenWeek = new Map();     // hullKey -> week last seen (bounded)
    this._nomineeUntil = new Map(); // hullKey -> end of next week (bounded)
    this._chalkedWeek = -1;
    this._chalkedHull = null;
    this._patchWeek = -1;
    this._nominateHold = 0;
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
    this._seen.clear();
    this._helpHold.clear();
    this._seenWeek.clear();
    this._nomineeUntil.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._seen.clear();
    this._helpHold.clear();
    this._seenWeek.clear();
    this._nomineeUntil.clear();
    this._chalkedWeek = -1;
    this._chalkedHull = null;
    this._patchWeek = -1;
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._postId != null) rm(this._postId);
    this._postId = null;
    this._postIdWeek = -1;
    this._nominateHold = 0;
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
      if (data.stationId === CHALKED_NAME_TUNING.stationId) return e;
    }
    return null;
  },

  _ensurePost(s, now, week) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    if (this._postId != null && this._postIdWeek === week) {
      const post = s.entities?.get?.(this._postId);
      return post?.pos ?? null;
    }
    if (this._postId != null) {
      this.helpers?.removeEntity?.(this._postId);
      this._postId = null;
    }
    const h = hash32('plantsPl352post', CHALKED_NAME_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * CHALKED_NAME_TUNING.postOffsetWu,
      z: station.pos.z + Math.sin(bearing) * CHALKED_NAME_TUNING.postOffsetWu,
    };
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: CHALKED_NAME_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The chalk post — one name a week for a free gate service',
        storyPropKind: 'ashfall_chalk_post',
        plantsPl352Post: true,
        lampsFlashing: true,
        lampFlashUntil: now + 1,
        swarmFloorPad: { label: 'THE CHALK POST' },
        masslineTetherable: true,
        homeSectorId: CHALKED_NAME_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) {
      this._postId = ent.id;
      this._postIdWeek = week;
    }
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

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== CHALKED_NAME_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    const step = this._acc;
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const now = this._now(s);
    const t = CHALKED_NAME_TUNING;
    const week = chalkWeekFor(now, t);
    const pos = this._ensurePost(s, now, week);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const hullKey = this._hullKey(s, player);

    // Week bell: draw the chalk from the week's seen set (nominees never land).
    if (week !== this._chalkedWeek) {
      const seen = this._seen.get(week - 1);
      let name = drawChalkName(week - 1, seen);
      if (name != null) {
        // The chalk never lands on nominees.
        const nomineeUntil = this._nomineeUntil.get(name);
        if (Number.isFinite(nomineeUntil) && nomineeUntil > (week - 1) * t.weekS) name = null;
      }
      this._chalkedWeek = week;
      this._chalkedHull = name;
      this._seen.delete(week - 1);
      if (name != null) {
        const sd = station.data || (station.data = {});
        sd.plantsPl352Chalk = { hullKey: name, until: week * t.weekS };  // economy handoff stamp
      }
    }

    // Seen helping: hold position beside a needy civilian inside the station's sight.
    const stationDist = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z);
    if (stationDist <= t.sightRadiusWu && typeof s.entities?.values === 'function') {
      let holding = false;
      for (const e of s.entities.values()) {
        if (!e || e.alive === false || e.id === s.playerId || e.type !== 'ship' || !e.pos) continue;
        if (!needsHelp(e, t)) continue;
        const d = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
        if (d <= t.helpRadiusWu) { holding = true; break; }
      }
      if (holding) {
        const rec = this._helpHold.get(hullKey) || { week, seconds: 0 };
        if (rec.week !== week) { rec.week = week; rec.seconds = 0; }
        rec.seconds += step;
        this._helpHold.set(hullKey, rec);
        if (this._helpHold.size > t.memoryCap) this._helpHold.delete(this._helpHold.keys().next().value);
        if (rec.seconds >= t.helpHoldS && this._seenWeek.get(hullKey) !== week) {
          this._seenWeek.set(hullKey, week);
          if (this._seenWeek.size > t.memoryCap) this._seenWeek.delete(this._seenWeek.keys().next().value);
          let set = this._seen.get(week);
          if (!set) { set = new Set(); this._seen.set(week, set); }
          if (this._seen.size > t.memoryCap) this._seen.delete(this._seen.keys().next().value);
          set.add(hullKey);
          this.bus?.emit(PL_352_SEEN_EVENT, { hullKey, week, t: now });
        }
      }

      // The chalked week's courtesy, in kind: welcome flash + one free patch.
      if (this._chalkedHull === hullKey && this._patchWeek !== week) {
        this._patchWeek = week;
        player.hull = Math.min(finite(player.hullMax, player.hull), finite(player.hull) + t.courtesyHull);
        this.bus?.emit(PL_352_CHALKED_EVENT, { hullKey, week, hull: player.hull, t: now });
        this._voice('plants:pl352:chalked', CHALKED_LINE, 5);
        this._popup('plants:pl352:chalked', KEYKEEPER_SENDER, CHALKED_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1 });
      }
    }

    // Nominate yourself: dwell in the post's nominate ring for the hold window.
    const postDist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    if (postDist <= t.nominateRadiusWu) {
      this._nominateHold += step;
      if (this._nominateHold >= t.nominateHoldS && !isNominee(this._nomineeUntil, hullKey, now)) {
        const until = (week + 2) * t.weekS;   // this week and next: the chalk never lands
        this._nomineeUntil.set(hullKey, until);
        if (this._nomineeUntil.size > t.memoryCap) this._nomineeUntil.delete(this._nomineeUntil.keys().next().value);
        const sd = station.data || (station.data = {});
        sd.plantsPl352WhyNominee = hullKey;   // everyone knows why
        player.data = player.data || {};
        player.data.plantsPl352Nominee = true;  // the stamp everyone can read
        this.bus?.emit(PL_352_NOMINATED_EVENT, { hullKey, until, t: now });
        this._voice('plants:pl352:nominated', NOMINATED_LINE, 5);
        this._popup('plants:pl352:nominated', KEYKEEPER_SENDER, NOMINATED_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.45, rate: 0.9 });
      }
    } else {
      this._nominateHold = Math.max(0, this._nominateHold - step);
    }
  },
};

export const pl352ChalkedNamePlant = pl352ChalkedName;
