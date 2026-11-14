// PL-339 Eris Margin — "The signal mirror. When debris weather closes the Margin, a fixed mirror
// flashes three short from the post — saving you the whole dead trip | Turn back on the flash; or
// ignore it and fly in anyway — the keeper stops flashing for your hull | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Margin is sector_eris_margin / station_eris_margin (verified in
// src/data/frontierRegions/north.js). The mirror exists only in the row, so it is a fixed
// story-prop buoy at the post (beacons.js story-prop shape) whose flash is the shipped lamp flag
// (data.lampsFlashing + lampFlashUntil, restamped on the three-short pattern each second while
// closed). Debris weather has no live weather seam on this sector, so closure is deterministic:
// pure `isMarginClosed(day)` — one day in three, hashed — stated as a substitute, not faked.
// Ignoring the flash is physical: crossing into the closed reach while the mirror was flashing
// mutes the mirror FOR THAT HULL for a season, and the dead trip bites: capped gust impulses
// while inside the closed reach.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned mirror (RESET not
//   unsubscribe). Bounded per-hull ledgers (tuning.memoryCap); flash and gust cooldowns.
// - The keeper stops flashing for your hull only: the mirror still serves everyone else.

import { hash32 } from '../../core/rng.js';

export const PL_339_FLASH_EVENT = 'plants:pl339:flash';
export const PL_339_TURNED_BACK_EVENT = 'plants:pl339:turnedBack';
export const PL_339_IGNORED_EVENT = 'plants:pl339:ignored';

export const MIRROR_SENDER = 'THE SIGNAL MIRROR';
export const TURNED_LINE = 'Safe turn. The keeper notes it.';
export const MUTED_LINE = 'No more flashes for your hull.';

export const SIGNAL_MIRROR_TUNING = Object.freeze({
  plId: 'pl339',
  sectorId: 'sector_eris_margin',
  stationId: 'station_eris_margin',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  mirrorOffsetWu: 300,
  approachRadiusWu: 220,
  closedRadiusWu: 160,       // inside here while closed is "flew in anyway"
  closedDayRemainder: 0,     // hash % 3 === this means debris weather closes the day
  flashPatternS: 0.5,        // three short: on/off at half-second steps
  flashLoudS: 20,            // how often the flash event may fire while you wait
  turnBackWindowS: 30,
  mutedDays: 90,             // a season: the keeper stops flashing for your hull
  gustImpulseWu: 22,         // the dead trip argues with you
  gustCooldownS: 6,
  gustCountCap: 30,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: debris weather closes the Margin one day in three, hashed. */
export function isMarginClosed(dayIndex, tuning = SIGNAL_MIRROR_TUNING) {
  const day = Math.floor(finite(dayIndex));
  return hash32('plantsPl339weather', day) % 3 === tuning.closedDayRemainder;
}

/** Pure: the three-short pattern — is the mirror lamp ON at simTime `now` within this second? */
export function flashPhaseOn(now) {
  const m = ((now % 1.5) + 1.5) % 1.5;
  return m < 0.5 || (m >= 1.0 && m < 1.5);
}

/** Pure: is this hull currently muted (no flashes for it)? */
export function isMutedFor(mutedUntil, hullKey, now) {
  const until = mutedUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl339SignalMirror = {
  name: 'plantsPl339',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._mirrorId = null;
    this._approachAt = null;         // when the hull entered the approach while closed
    this._sawFlash = false;
    this._mutedUntil = new Map();    // hullKey -> simTime (bounded)
    this._gusts = new Map();         // hullKey -> { count, lastGust } (bounded)
    this._toldMutedAt = new Map();
    this._lastFlashEventAt = -Infinity;
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
    this._mutedUntil.clear();
    this._gusts.clear();
    this._toldMutedAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._mutedUntil.clear();
    this._gusts.clear();
    this._toldMutedAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._mirrorId != null) rm(this._mirrorId);
    this._mirrorId = null;
    this._approachAt = null;
    this._sawFlash = false;
    this._lastFlashEventAt = -Infinity;
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
      if (data.stationId === SIGNAL_MIRROR_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureMirror(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const h = hash32('plantsPl339mirror', SIGNAL_MIRROR_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * SIGNAL_MIRROR_TUNING.mirrorOffsetWu,
      z: station.pos.z + Math.sin(bearing) * SIGNAL_MIRROR_TUNING.mirrorOffsetWu,
    };
    if (this._mirrorId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: SIGNAL_MIRROR_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The signal mirror — three short means the Margin is closed',
        storyPropKind: 'eris_signal_mirror',
        plantsPl339Mirror: true,
        lampsFlashing: false,
        lampFlashUntil: now,
        swarmFloorPad: { label: 'SIGNAL MIRROR' },
        masslineTetherable: true,
        homeSectorId: SIGNAL_MIRROR_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._mirrorId = ent.id;
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
    if (s.world?.currentSectorId !== SIGNAL_MIRROR_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    const step = this._acc;
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const pos = this._ensureMirror(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = SIGNAL_MIRROR_TUNING;
    const hullKey = this._hullKey(s, player);
    const day = Math.floor(now / t.MERCY_DAY_S);
    const closed = isMarginClosed(day, t);
    const dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    const mirror = this._mirrorId != null && typeof s.entities?.get === 'function'
      ? s.entities.get(this._mirrorId) : null;
    if (!mirror?.data) return;
    const muted = isMutedFor(this._mutedUntil, hullKey, now);

    if (closed && dist <= t.approachRadiusWu && !muted) {
      // Three short: restamp the shipped lamp flag on the flash pattern.
      const on = flashPhaseOn(now);
      mirror.data.lampsFlashing = on;
      mirror.data.lampFlashUntil = now + 1;
      this._sawFlash = true;
      if (this._approachAt == null) this._approachAt = now;
      if (now - this._lastFlashEventAt >= t.flashLoudS) {
        this._lastFlashEventAt = now;
        this.bus?.emit(PL_339_FLASH_EVENT, { hullKey, day, t: now });
        this.bus?.emit('audio:cue', { id: 'warning', position: { x: pos.x, z: pos.z }, gain: 0.45, rate: 1.2 });
      }
      // Turn back on the flash: leave the approach and the keeper notes it.
      if (dist > t.approachRadiusWu * 0.9 && this._approachAt != null
        && now - this._approachAt <= t.turnBackWindowS) {
        this._approachAt = null;
        this._sawFlash = false;
        this.bus?.emit(PL_339_TURNED_BACK_EVENT, { hullKey, day, t: now });
        this._voice('plants:pl339:turned', TURNED_LINE, 5);
        this._popup('plants:pl339:turned', MIRROR_SENDER, TURNED_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'confirm', position: null, gain: 0.45, rate: 1 });
        return;
      }
    } else if (!closed || dist > t.approachRadiusWu) {
      if (!closed) { mirror.data.lampsFlashing = false; mirror.data.lampFlashUntil = now; }
      this._approachAt = null;
    }

    // Ignore it and fly in anyway: inside the closed reach after seeing the flash.
    if (closed && dist <= t.closedRadiusWu && this._sawFlash && !muted) {
      const until = now + t.mutedDays * t.MERCY_DAY_S;
      this._mutedUntil.set(hullKey, until);
      if (this._mutedUntil.size > t.memoryCap) this._mutedUntil.delete(this._mutedUntil.keys().next().value);
      this._gusts.set(hullKey, { count: 0, lastGust: -Infinity });
      if (this._gusts.size > t.memoryCap) this._gusts.delete(this._gusts.keys().next().value);
      const stationData = station.data || (station.data = {});
      stationData.plantsPl339Muted = hullKey;
      this.bus?.emit(PL_339_IGNORED_EVENT, { hullKey, until, t: now });
      this._voice('plants:pl339:muted', MUTED_LINE, 5);
      this._popup('plants:pl339:muted', MIRROR_SENDER, MUTED_LINE, 6);
      this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.45, rate: 0.9 });
    }

    // The dead trip argues with you: capped gusts bite hulls inside the closed reach.
    if (closed && dist <= t.closedRadiusWu) {
      const rec = this._gusts.get(hullKey);
      if (rec && rec.count < t.gustCountCap && now - rec.lastGust >= t.gustCooldownS) {
        rec.lastGust = now;
        rec.count += 1;
        const h = hash32('plantsPl339gust', Math.floor(now));
        const ang = (h % 628) / 100;
        player.vel.x += Math.cos(ang) * t.gustImpulseWu * step;
        player.vel.z += Math.sin(ang) * t.gustImpulseWu * step;
      }
    }
  },
};

export const pl339SignalMirrorPlant = pl339SignalMirror;
