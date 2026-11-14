// PL-343 Triton Wake — "The lift bell. Ring the Wake's bell and a passing hauler breaks off to
// check your line once | Ring once; or ring it twice — the bell goes quiet for your hull, and
// haulers stop breaking off | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Wake is sector_triton_wake / station_triton (verified in
// src/data/frontierRegions/east.js; PL-143's patch approach already anchors there). The bell
// exists only in the row, so it is a story-prop buoy near the station (beacons.js story-prop
// shape, swarmFloorPad label). Ringing is physical: bump the bell at ring pace inside its ring.
// "A passing hauler breaks off" uses the REAL traffic seam, not a minted hull: the nearest live
// civilian 'ship' entity inside haulerRange is stamped (data.plantsPl343Check — a namespaced,
// read-only dressing stamp other systems may read) and its lamps flash, while the bell's mercy is
// a bounded line-check pull toward the station on YOUR hull. The PL-09 lesson is honored: no
// invented NPC, no string-id tug. Ring it twice inside the bell window and the bell goes quiet
// for your hull for a season (station.data.plantsPl343Quiet names you).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned bell (RESET not
//   unsubscribe). Bounded per-hull ledgers (tuning.memoryCap); ring cooldown; capped pull.
// - Civilian hulls are never moved by this plant: only their data stamp + lamps are touched.

import { hash32 } from '../../core/rng.js';

export const PL_343_RING_EVENT = 'plants:pl343:ring';
export const PL_343_CHECK_EVENT = 'plants:pl343:check';
export const PL_343_SILENCED_EVENT = 'plants:pl343:silenced';

export const BELL_SENDER = 'THE LIFT BELL';
export const CHECK_LINE = 'Line checked. Fly safe.';
export const SILENCED_LINE = 'The bell goes quiet for you.';

export const LIFT_BELL_TUNING = Object.freeze({
  plId: 'pl343',
  sectorId: 'sector_triton_wake',
  stationId: 'station_triton',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  bellOffsetWu: 210,
  ringRadiusWu: 42,
  ringSpeedWu: 18,           // a bump at pace rings it
  ringCooldownS: 30,
  ringWindowS: 120,          // ring it twice inside this window and the bell goes quiet
  haulerRangeWu: 700,        // a passing hauler: a live civilian hull inside this range
  checkPullWu: 12,           // the line-check lift, toward the station, capped
  checkWindowS: 10,
  silencedDays: 90,          // a season
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the nearest live civilian hull that could break off for the ring. */
export function nearestCivilian(state, fromPos, maxRange = LIFT_BELL_TUNING.haulerRangeWu) {
  if (!state || typeof state.entities?.values !== 'function' || !fromPos) return null;
  let best = null;
  let bestD2 = maxRange * maxRange;
  for (const e of state.entities.values()) {
    if (!e || e.alive === false || e.type !== 'ship' || e.id === state.playerId || !e.pos) continue;
    const dx = e.pos.x - fromPos.x;
    const dz = e.pos.z - fromPos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= bestD2) { bestD2 = d2; best = e; }
  }
  return best;
}

/** Pure: is the bell silenced for this hull? */
export function isSilencedFor(silencedUntil, hullKey, now) {
  const until = silencedUntil?.get?.(String(hullKey));
  return Number.isFinite(until) && now < until;
}

export const pl343LiftBell = {
  name: 'plantsPl343',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._bellId = null;
    this._rings = new Map();        // hullKey -> lastRingAt (bounded)
    this._checkUntil = null;        // simTime: the line-check pull window on the player hull
    this._silencedUntil = new Map();// hullKey -> simTime (bounded)
    this._toldSilencedAt = new Map();
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
    this._rings.clear();
    this._silencedUntil.clear();
    this._toldSilencedAt.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._rings.clear();
    this._silencedUntil.clear();
    this._toldSilencedAt.clear();
    this._checkUntil = null;
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._bellId != null) rm(this._bellId);
    this._bellId = null;
    this._checkUntil = null;
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
      if (data.stationId === LIFT_BELL_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureBell(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const h = hash32('plantsPl343bell', LIFT_BELL_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * LIFT_BELL_TUNING.bellOffsetWu,
      z: station.pos.z + Math.sin(bearing) * LIFT_BELL_TUNING.bellOffsetWu,
    };
    if (this._bellId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: LIFT_BELL_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The lift bell — ring once and a passing hauler checks your line',
        storyPropKind: 'wake_lift_bell',
        plantsPl343Bell: true,
        lampsFlashing: false,
        lampFlashUntil: now,
        swarmFloorPad: { label: 'THE LIFT BELL — RING' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: LIFT_BELL_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._bellId = ent.id;
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
    if (s.world?.currentSectorId !== LIFT_BELL_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    const step = this._acc;
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const pos = this._ensureBell(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = LIFT_BELL_TUNING;
    const hullKey = this._hullKey(s, player);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));

    // The line-check mercy in progress: a bounded pull toward the station.
    if (this._checkUntil != null && now < this._checkUntil) {
      const sx = station.pos.x - player.pos.x;
      const sz = station.pos.z - player.pos.z;
      const sd = Math.hypot(sx, sz) || 1;
      player.vel.x += (sx / sd) * t.checkPullWu * step;
      player.vel.z += (sz / sd) * t.checkPullWu * step;
    }

    const dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    if (dist > t.ringRadiusWu) return;

    if (isSilencedFor(this._silencedUntil, hullKey, now)) {
      const last = this._toldSilencedAt.get(hullKey) ?? -Infinity;
      if (now - last >= t.MERCY_DAY_S) {
        this._toldSilencedAt.set(hullKey, now);
        this.bus?.emit(PL_343_SILENCED_EVENT, { hullKey, refused: true, t: now });
        this._voice('plants:pl343:silenced', SILENCED_LINE, 5);
        this._popup('plants:pl343:silenced', BELL_SENDER, SILENCED_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.4, rate: 0.9 });
      }
      return;
    }

    // Ring: a bump at pace inside the bell's ring.
    if (speed >= t.ringSpeedWu) {
      const lastRing = this._rings.get(hullKey) ?? -Infinity;
      if (now - lastRing < t.ringCooldownS) return;
      if (lastRing > -Infinity && now - lastRing <= t.ringWindowS) {
        // Ring it twice: the bell goes quiet for your hull, and haulers stop breaking off.
        const until = now + t.silencedDays * t.MERCY_DAY_S;
        this._silencedUntil.set(hullKey, until);
        if (this._silencedUntil.size > t.memoryCap) this._silencedUntil.delete(this._silencedUntil.keys().next().value);
        const sd = station.data || (station.data = {});
        sd.plantsPl343Quiet = hullKey;
        this._checkUntil = null;
        this.bus?.emit(PL_343_SILENCED_EVENT, { hullKey, until, t: now });
        this._voice('plants:pl343:silenced', SILENCED_LINE, 5);
        this._popup('plants:pl343:silenced', BELL_SENDER, SILENCED_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'warning', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 0.9 });
        return;
      }
      this._rings.set(hullKey, now);
      if (this._rings.size > t.memoryCap) this._rings.delete(this._rings.keys().next().value);
      const bell = this._bellId != null ? s.entities?.get?.(this._bellId) : null;
      if (bell?.data) {
        bell.data.lampsFlashing = true;
        bell.data.lampFlashUntil = now + 2;
      }
      this.bus?.emit(PL_343_RING_EVENT, { hullKey, t: now });
      this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 0.8 });
      // A passing hauler breaks off to check your line once.
      const hauler = nearestCivilian(s, player.pos, t.haulerRangeWu);
      if (hauler?.data) {
        hauler.data.plantsPl343Check = { targetId: player.id ?? s.playerId, until: now + t.checkWindowS };
        hauler.data.lampsFlashing = true;
        hauler.data.lampFlashUntil = now + t.checkWindowS;
        this._checkUntil = now + t.checkWindowS;
        this.bus?.emit(PL_343_CHECK_EVENT, { hullKey, haulerId: hauler.id, until: this._checkUntil, t: now });
        this._voice('plants:pl343:check', CHECK_LINE, 5);
        this._popup('plants:pl343:check', BELL_SENDER, CHECK_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'confirm', position: null, gain: 0.45, rate: 1 });
      }
    }
  },
};

export const pl343LiftBellPlant = pl343LiftBell;
