// PL-345 Sedna Dark — "The kettle window. The one lit window keeps a kettle going for whoever
// knocks, any hour, no charge, one cup | Knock for the cup; or knock and ask for fuel too, every
// night — the kettle cools for you, and the window stays warm | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): Sedna Dark is sector_sedna_dark / station_sedna (verified in
// src/data/frontierRegions/south.js — PL-155's hatch already lives out past the last lamp here).
// The lit window exists only in the row, so it is a story-prop post whose warm window is the
// shipped lamp flag (data.lampsFlashing + lampFlashUntil, held steady while anyone is near).
// Knocking is physical: drift into the knock ring at knock pace. The cup is the honest mercy in
// kind: a small free hull patch (the shipped PL-143 outside-dock courtesy precedent), no charge,
// one per hull per mercy day. Asking for fuel too is physical as well: a second knock on the
// same night. Warn once; keep asking and the kettle cools FOR THAT HULL for a month — while the
// window itself stays warm (the lamp never darkens; others still get theirs).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned window (RESET not
//   unsubscribe). Bounded per-hull ledgers (tuning.memoryCap); one cup per hull per day.
// - NO economy mutations: "no charge" is the plant's point; the fuel request is never granted.

import { hash32 } from '../../core/rng.js';

export const PL_345_CUP_EVENT = 'plants:pl345:cup';
export const PL_345_GREEDY_EVENT = 'plants:pl345:greedy';
export const PL_345_COOLED_EVENT = 'plants:pl345:cooled';

export const WINDOW_SENDER = 'THE KETTLE WINDOW';
export const CUP_LINE = "Kettle's on. No charge.";
export const GREEDY_LINE = 'One cup. The window stays warm.';
export const COOLED_LINE = "Kettle's cool for you. Window stays warm.";

export const KETTLE_WINDOW_TUNING = Object.freeze({
  plId: 'pl345',
  sectorId: 'sector_sedna_dark',
  stationId: 'station_sedna',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  windowOffsetWu: 170,
  glowRadiusWu: 240,         // the one lit window — visible this far out
  knockRadiusWu: 44,
  knockSpeedWu: 12,          // a knock: drift in slow
  knockCooldownS: 20,        // distinct knocks, not one long hover
  cupHull: 4,                // the cup, in kind (the shipped outside-dock courtesy shape)
  greedyWarnDays: 1,         // one warning night, then the kettle cools
  cooledDays: 30,            // a month
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the cupped hull — capped, never over max. */
export function cuppedHull(hull, hullMax, amount = KETTLE_WINDOW_TUNING.cupHull) {
  if (!Number.isFinite(hull) || !Number.isFinite(hullMax) || hullMax <= 0) return hull;
  return Math.min(hullMax, hull + amount);
}

/** Pure: is the kettle cooled for this hull right now? */
export function isCooledFor(cooledUntil, hullKey, now) {
  const until = cooledUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl345KettleWindow = {
  name: 'plantsPl345',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._windowId = null;
    this._knocks = new Map();       // hullKey -> { day, count, greedyDay } (bounded)
    this._lastKnockAt = new Map();  // hullKey -> simTime of last counted knock (bounded)
    this._cooledUntil = new Map();  // hullKey -> simTime (bounded)
    this._toldCoolAt = new Map();
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
    this._knocks.clear();
    this._cooledUntil.clear();
    this._toldCoolAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._knocks.clear();
    this._lastKnockAt.clear();
    this._cooledUntil.clear();
    this._toldCoolAt.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._windowId != null) rm(this._windowId);
    this._windowId = null;
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
      if (data.stationId === KETTLE_WINDOW_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureWindow(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const h = hash32('plantsPl345window', KETTLE_WINDOW_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * KETTLE_WINDOW_TUNING.windowOffsetWu,
      z: station.pos.z + Math.sin(bearing) * KETTLE_WINDOW_TUNING.windowOffsetWu,
    };
    if (this._windowId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: KETTLE_WINDOW_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The kettle window — knock, any hour, one cup, no charge',
        storyPropKind: 'sedna_kettle_window',
        plantsPl345Window: true,
        lampsFlashing: true,
        lampFlashUntil: now + 1,
        swarmFloorPad: { label: 'THE KETTLE WINDOW' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: KETTLE_WINDOW_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._windowId = ent.id;
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
    if (s.world?.currentSectorId !== KETTLE_WINDOW_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const pos = this._ensureWindow(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = KETTLE_WINDOW_TUNING;
    const hullKey = this._hullKey(s, player);
    const day = Math.floor(now / t.MERCY_DAY_S);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);

    // The one lit window holds its warmth while anyone is near it — for anyone.
    const win = this._windowId != null && typeof s.entities?.get === 'function'
      ? s.entities.get(this._windowId) : null;
    if (win?.data && dist <= t.glowRadiusWu) {
      win.data.lampsFlashing = true;
      win.data.lampFlashUntil = now + 1;
    }

    if (dist > t.knockRadiusWu) return;
    if (speed > t.knockSpeedWu) return;
    const lastKnock = this._lastKnockAt.get(hullKey) ?? -Infinity;
    if (now - lastKnock < t.knockCooldownS) return;
    this._lastKnockAt.set(hullKey, now);

    const cooled = isCooledFor(this._cooledUntil, hullKey, now);
    if (cooled) {
      const last = this._toldCoolAt.get(hullKey) ?? -Infinity;
      if (now - last >= t.MERCY_DAY_S) {
        this._toldCoolAt.set(hullKey, now);
        this.bus?.emit(PL_345_COOLED_EVENT, { hullKey, refused: true, t: now });
        this._voice('plants:pl345:cooled', COOLED_LINE, 5);
        this._popup('plants:pl345:cooled', WINDOW_SENDER, COOLED_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 0.9 });
      }
      return;   // the window stays warm — the lamp is untouched above
    }

    // A knock on the same night is asking for fuel too.
    const rec = this._knocks.get(hullKey);
    const entry = rec && rec.day === day ? rec : { day, count: 0, greedyDay: null };
    entry.count += 1;
    this._knocks.set(hullKey, entry);
    if (this._knocks.size > t.memoryCap) this._knocks.delete(this._knocks.keys().next().value);

    if (entry.count === 1) {
      // Knock for the cup: no charge, one cup.
      player.hull = cuppedHull(player.hull, player.hullMax, t.cupHull);
      player.data = player.data || {};
      player.data.plantsPl345CupDay = day;
      this.bus?.emit(PL_345_CUP_EVENT, { hullKey, day, hull: player.hull, t: now });
      this._voice('plants:pl345:cup', CUP_LINE, 5);
      this._popup('plants:pl345:cup', WINDOW_SENDER, CUP_LINE, 6);
      this.bus?.emit('audio:cue', { id: 'confirm', position: { x: pos.x, z: pos.z }, gain: 0.45, rate: 1.1 });
    } else if (entry.count === 2 && entry.greedyDay !== day) {
      // Knock and ask for fuel too: warned once, honestly.
      entry.greedyDay = day;
      this.bus?.emit(PL_345_GREEDY_EVENT, { hullKey, day, warned: true, t: now });
      this._voice('plants:pl345:greedy', GREEDY_LINE, 5);
      this._popup('plants:pl345:greedy', WINDOW_SENDER, GREEDY_LINE, 6);
      this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 0.9 });
    } else if (entry.count > 2) {
      // Every night: the kettle cools for you; the window stays warm.
      const until = now + t.cooledDays * t.MERCY_DAY_S;
      this._cooledUntil.set(hullKey, until);
      if (this._cooledUntil.size > t.memoryCap) this._cooledUntil.delete(this._cooledUntil.keys().next().value);
      const sd = station.data || (station.data = {});
      sd.plantsPl345Cooled = hullKey;
      this.bus?.emit(PL_345_COOLED_EVENT, { hullKey, until, t: now });
      this._voice('plants:pl345:cooled', COOLED_LINE, 5);
      this._popup('plants:pl345:cooled', WINDOW_SENDER, COOLED_LINE, 6);
      this.bus?.emit('audio:cue', { id: 'warning', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 0.9 });
    }
  },
};

export const pl345KettleWindowPlant = pl345KettleWindow;
