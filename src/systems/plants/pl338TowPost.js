// PL-338 Haumea Rift — "The tow-post. The Rift's post lends a line to stuck hulls, no fee, one
// per hull per week | Borrow your one; or take two in a week — the post rations you for a month,
// in front of everyone | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Rift is sector_haumea_rift / station_haumea_rift (verified in
// src/data/frontierRegions/north.js). The post exists only in the row, so it is a story-prop
// (beacons.js story-prop shape, swarmFloorPad label). Borrowing is physical: be stuck (crawl
// pace) inside the lend ring and the post's line takes the strain — a deterministic pull toward
// the station gate for a bounded tow window, no fee, no economy writes. "One per hull per week"
// uses the sibling tuning week (7 x MERCY_DAY_S); taking two in a week rations the hull for a
// month — the refusal happens in front of everyone as a namespaced stamp on the station
// (station.data.plantsPl338Ration, readable by any scan of the post).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned post (RESET not
//   unsubscribe). Bounded per-hull ledgers (tuning.memoryCap); velocity writes touch only the
//   borrowing hull.
// - NO economy mutations: "no fee" is the plant's whole point, and the ration is a stamp.

import { hash32 } from '../../core/rng.js';
import { queuePlayerImpulse } from './playerImpulse.js';

export const PL_338_LENT_EVENT = 'plants:pl338:lent';
export const PL_338_RATIONED_EVENT = 'plants:pl338:rationed';

export const POST_SENDER = 'THE TOW-POST';
export const LENT_LINE = 'One line, no fee.';
export const RATION_LINE = 'Rationed — a month, in front of everyone.';

export const TOW_POST_TUNING = Object.freeze({
  plId: 'pl338',
  sectorId: 'sector_haumea_rift',
  stationId: 'station_haumea_rift',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  postOffsetWu: 340,
  lendRadiusWu: 130,
  stuckSpeedWu: 14,
  towSpeedWu: 22,            // the line takes the strain toward the station gate
  towWindowS: 12,
  weekS: 7 * 240,            // one lend per hull per week
  rationDays: 30,            // a month
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the week key a simTime falls in (the post's ration calendar). */
export function weekKeyFor(now, tuning = TOW_POST_TUNING) {
  return Math.floor(finite(now) / tuning.weekS);
}

/** Pure: is this hull rationed right now? */
export function isRationed(rationedUntil, hullKey, now) {
  const until = rationedUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl338TowPost = {
  name: 'plantsPl338',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._postId = null;
    this._lends = new Map();        // hullKey -> { week, towUntil } (bounded)
    this._rationedUntil = new Map();// hullKey -> simTime (bounded)
    this._toldRationAt = new Map();
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
    this._lends.clear();
    this._rationedUntil.clear();
    this._toldRationAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._lends.clear();
    this._rationedUntil.clear();
    this._toldRationAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._postId != null) rm(this._postId);
    this._postId = null;
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
      if (data.stationId === TOW_POST_TUNING.stationId) return e;
    }
    return null;
  },

  _ensurePost(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const h = hash32('plantsPl338post', TOW_POST_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * TOW_POST_TUNING.postOffsetWu,
      z: station.pos.z + Math.sin(bearing) * TOW_POST_TUNING.postOffsetWu,
    };
    if (this._postId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 6,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: TOW_POST_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: "The tow-post — a lent line for stuck hulls, no fee, one a week",
        storyPropKind: 'rift_tow_post',
        plantsPl338Post: true,
        swarmFloorPad: { label: 'THE TOW-POST' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: TOW_POST_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._postId = ent.id;
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
    if (s.world?.currentSectorId !== TOW_POST_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    const step = this._acc;
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const pos = this._ensurePost(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = TOW_POST_TUNING;
    const hullKey = this._hullKey(s, player);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    if (dist > t.lendRadiusWu) return;

    const rationed = isRationed(this._rationedUntil, hullKey, now);
    if (rationed) {
      const post = this._postId != null && typeof s.entities?.get === 'function'
        ? s.entities.get(this._postId) : null;
      if (post?.data) {
        post.data.lampsFlashing = true;      // the refusal is visible
        post.data.lampFlashUntil = now + 1;
      }
      const last = this._toldRationAt.get(hullKey) ?? -Infinity;
      if (speed <= t.stuckSpeedWu && now - last >= t.MERCY_DAY_S) {
        this._toldRationAt.set(hullKey, now);
        this.bus?.emit(PL_338_RATIONED_EVENT, { hullKey, refused: true, t: now });
        this._voice('plants:pl338:ration', RATION_LINE, 5);
        this._popup('plants:pl338:ration', POST_SENDER, RATION_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 0.9 });
      }
      return;
    }

    // Stuck hull inside the lend ring: the post lends its line.
    if (dist <= t.lendRadiusWu && speed <= t.stuckSpeedWu) {
      const week = weekKeyFor(now, t);
      const rec = this._lends.get(hullKey);
      if (rec && rec.week === week && now < (rec.towUntil ?? 0)) {
        // Tow in progress: keep the strain toward the station gate — through the
        // membrane (the lending post is the visible source), never a raw vel write.
        const sx = station.pos.x - player.pos.x;
        const sz = station.pos.z - player.pos.z;
        const sd = Math.hypot(sx, sz) || 1;
        queuePlayerImpulse(s, player, (sx / sd) * t.towSpeedWu * step, (sz / sd) * t.towSpeedWu * step,
          'plantsPl338TowPost', { continuous: true, dt: step });
        return;
      }
      if (rec && rec.week === week) {
        // Take two in a week: the post rations you for a month, in front of everyone.
        const until = now + t.rationDays * t.MERCY_DAY_S;
        this._rationedUntil.set(hullKey, until);
        if (this._rationedUntil.size > t.memoryCap) this._rationedUntil.delete(this._rationedUntil.keys().next().value);
        const sd = station.data || (station.data = {});
        sd.plantsPl338Ration = { hullKey, until };     // everyone can read it
        this.bus?.emit(PL_338_RATIONED_EVENT, { hullKey, until, week, t: now });
        this._voice('plants:pl338:ration', RATION_LINE, 5);
        this._popup('plants:pl338:ration', POST_SENDER, RATION_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'warning', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 0.9 });
        return;
      }
      // Borrow your one: a fresh line this week.
      this._lends.set(hullKey, { week, towUntil: now + t.towWindowS });
      if (this._lends.size > t.memoryCap) this._lends.delete(this._lends.keys().next().value);
      this.bus?.emit(PL_338_LENT_EVENT, { hullKey, week, towUntil: now + t.towWindowS, t: now });
      this._voice('plants:pl338:lent', LENT_LINE, 5);
      this._popup('plants:pl338:lent', POST_SENDER, LENT_LINE, 6);
      this.bus?.emit('audio:cue', { id: 'confirm', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 1 });
    }
  },
};

export const pl338TowPostPlant = pl338TowPost;
