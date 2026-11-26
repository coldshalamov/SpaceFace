// PL-342 Proteus Well — "The bleed vent. The Well's oxygen bleed runs free for stragglers, one
// lungful at a time, first come | Breathe and go; or tape a bag to it — the vent gets a meter,
// and the bag gets returned to you | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Well is sector_proteus_well / station_proteus (verified in
// src/data/frontierRegions/east.js). The bleed vent exists only in the row, so it is a story-prop
// post (beacons.js story-prop shape, swarmFloorPad label). There is no per-hull oxygen meter in
// the sim (no O2 writer anywhere in src/systems), so "one lungful" is granted as the honest
// substitute in kind: a small free hull patch on the breathing hull — the same outside-dock
// courtesy the shipped PL-143 good patch uses, capped and cooldown-gated. Stragglers are hulls
// at crawl pace inside the vent ring; "first come" is real: if another hull holds the ring, the
// vent serves them and you wait. Taping a bag is physical: your own jettisoned pod resting in
// the bag ring = a bag taped to the vent. The vent gets a meter (stamp + scan label, rest of the
// mercy day) and the bag is despawned and re-spawned beside your hull — returned to you.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned vent (RESET not
//   unsubscribe). Bounded ledgers (tuning.memoryCap); breathe cooldown; one meter per day.
// - NO economy mutations; the mercy is a capped hull patch (documented substitute).

import { hash32 } from '../../core/rng.js';
import { spawnJettisonedCargoPod } from '../lootShards.js';

export const PL_342_BREATH_EVENT = 'plants:pl342:breath';
export const PL_342_METERED_EVENT = 'plants:pl342:metered';
export const PL_342_BAG_RETURNED_EVENT = 'plants:pl342:bagReturned';

export const VENT_SENDER = 'THE BLEED VENT';
export const METER_LINE = 'The vent gets a meter.';

export const BLEED_VENT_TUNING = Object.freeze({
  plId: 'pl342',
  sectorId: 'sector_proteus_well',
  stationId: 'station_proteus',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  ventOffsetWu: 260,
  ventRadiusWu: 90,
  stragglerSpeedWu: 14,      // crawl pace: stragglers
  breathCooldownS: 20,       // one lungful at a time
  breathsCapDay: 4,          // camping the vent past this is taping a bag in spirit
  breathHull: 2,             // the honest substitute in kind for a lungful
  bagRadiusWu: 45,
  restSpeedWu: 6,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: is the vent metered at `now` (nobody freeloads a metered vent)? */
export function isMetered(meteredUntil, now) {
  return Number.isFinite(meteredUntil) && now < meteredUntil;
}

/** Pure: the patched hull after a lungful — capped, never over max. */
export function breathedHull(hull, hullMax, amount = BLEED_VENT_TUNING.breathHull) {
  if (!Number.isFinite(hull) || !Number.isFinite(hullMax) || hullMax <= 0) return hull;
  return Math.min(hullMax, hull + amount);
}

export const pl342BleedVent = {
  modes: ['flight'],
  name: 'plantsPl342',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._ventId = null;
    this._meteredUntil = null;
    this._meterDay = -1;
    this._breaths = new Map();      // hullKey -> { day, count, lastBreathAt } (bounded)
    this._toldMeterAt = -Infinity;
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
    this._breaths.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._breaths.clear();
    this._meteredUntil = null;
    this._meterDay = -1;
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._ventId != null) rm(this._ventId);
    this._ventId = null;
    this._meteredUntil = null;
    this._meterDay = -1;
    this._toldMeterAt = -Infinity;
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
      if (data.stationId === BLEED_VENT_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureVent(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const h = hash32('plantsPl342vent', BLEED_VENT_TUNING.sectorId);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    const pos = {
      x: station.pos.x + Math.cos(bearing) * BLEED_VENT_TUNING.ventOffsetWu,
      z: station.pos.z + Math.sin(bearing) * BLEED_VENT_TUNING.ventOffsetWu,
    };
    if (this._ventId != null) return pos;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: BLEED_VENT_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The oxygen bleed — free for stragglers, one lungful at a time',
        storyPropKind: 'well_bleed_vent',
        plantsPl342Vent: true,
        lampsFlashing: true,
        lampFlashUntil: now + 1,
        swarmFloorPad: { label: 'O2 BLEED — FREE' },
        masslineTetherable: true,
        homeSectorId: BLEED_VENT_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._ventId = ent.id;
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

  _meter(s, now, hullKey, cause) {
    const t = BLEED_VENT_TUNING;
    const day = Math.floor(now / t.MERCY_DAY_S);
    if (this._meterDay === day && isMetered(this._meteredUntil, now)) return;
    this._meterDay = day;
    this._meteredUntil = (day + 1) * t.MERCY_DAY_S;
    const vent = this._ventId != null && typeof s.entities?.get === 'function'
      ? s.entities.get(this._ventId) : null;
    if (vent?.data) {
      vent.data.plantsPl342Metered = true;
      vent.data.scanLabel = 'The oxygen bleed — METERED (somebody taped a bag to it)';
    }
    const station = this._station(s);
    if (station?.data) station.data.plantsPl342MeteredBy = hullKey;
    if (now - this._toldMeterAt >= t.MERCY_DAY_S) {
      this._toldMeterAt = now;
      this._voice('plants:pl342:metered', METER_LINE, 5);
      this._popup('plants:pl342:metered', VENT_SENDER, METER_LINE, 6);
    }
    this.bus?.emit(PL_342_METERED_EVENT, { hullKey, cause, until: this._meteredUntil, t: now });
    this.bus?.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.45, rate: 0.9 });
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== BLEED_VENT_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const pos = this._ensureVent(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!pos || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = BLEED_VENT_TUNING;
    const hullKey = this._hullKey(s, player);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    const day = Math.floor(now / t.MERCY_DAY_S);

    // Tape a bag to it: your own pod resting in the bag ring. Metered — and the bag is returned.
    if (typeof s.entities?.values === 'function') {
      for (const e of s.entities.values()) {
        if (!e || e.alive === false || !e.data?.playerJettisonOrigin || e.data.plantsPl342Bag) continue;
        const px = finite(e.pos?.x);
        const pz = finite(e.pos?.z);
        const espeed = Math.hypot(finite(e.vel?.x), finite(e.vel?.z));
        if (!Number.isFinite(px) || espeed > t.restSpeedWu) continue;
        if (Math.hypot(px - pos.x, pz - pos.z) > t.bagRadiusWu) continue;
        const commodityId = typeof e.data?.commodityId === 'string' ? e.data.commodityId : 'cmdty_scrap_metal';
        const mass = Number(e.physicsBody?.mass ?? e.mass) || 4;
        if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(e.id);
        // The bag gets returned to you: re-spawned beside your hull.
        let returnedId = null;
        if (typeof spawnJettisonedCargoPod === 'function' && Number.isFinite(player.pos.x)) {
          const back = spawnJettisonedCargoPod(s, {
            commodityId,
            amount: 1,
            unitMass: Math.max(1, mass),
            radius: 4,
            pos: { x: player.pos.x + 12, z: player.pos.z + 8 },
            vel: { x: 0, z: 0 },
            ownerId: s.playerId,
          }, this.helpers);
          if (back) {
            back.data = back.data || {};
            back.data.plantsPl342Returned = true;
            back.data.scanLabel = 'Your bag — returned to you';
            returnedId = back.id ?? null;
          }
        }
        this.bus?.emit(PL_342_BAG_RETURNED_EVENT, { hullKey, commodityId, returnedId, t: now });
        this._meter(s, now, hullKey, 'bag');
        break;
      }
    }

    if (dist > t.ventRadiusWu) return;

    // First come: if another hull holds the vent ring, it serves them — you wait.
    let busy = false;
    if (typeof s.entities?.values === 'function') {
      for (const e of s.entities.values()) {
        if (!e || e.alive === false || e.id === s.playerId || e.type !== 'ship' || !e.pos) continue;
        const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
        if (d <= t.ventRadiusWu * 0.5) { busy = true; break; }
      }
    }
    if (busy) return;

    const metered = isMetered(this._meteredUntil, now);
    if (metered && speed <= t.stragglerSpeedWu) {
      const vent = this._ventId != null ? s.entities?.get?.(this._ventId) : null;
      if (vent?.data && now - (this._lastRefusedAt ?? -Infinity) >= t.MERCY_DAY_S) {
        this._lastRefusedAt = now;
        this.bus?.emit(PL_342_METERED_EVENT, { hullKey, refused: true, t: now });
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: pos.x, z: pos.z }, gain: 0.35, rate: 0.9 });
      }
      return;
    }

    // Breathe and go: stragglers at crawl pace, one lungful at a time.
    if (speed <= t.stragglerSpeedWu) {
      const rec = this._breaths.get(hullKey);
      const lastBreath = rec?.lastBreathAt ?? -Infinity;
      if (now - lastBreath < t.breathCooldownS) return;
      const entry = rec && rec.day === day ? rec : { day, count: 0 };
      if (entry.count >= t.breathsCapDay) {
        // Camping the vent all day is taping a bag in spirit.
        this._meter(s, now, hullKey, 'camping');
        return;
      }
      entry.lastBreathAt = now;
      entry.count += 1;
      this._breaths.set(hullKey, entry);
      if (this._breaths.size > t.memoryCap) this._breaths.delete(this._breaths.keys().next().value);
      player.hull = breathedHull(player.hull, player.hullMax, t.breathHull);
      this.bus?.emit(PL_342_BREATH_EVENT, { hullKey, breaths: entry.count, hull: player.hull, t: now });
      this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: pos.x, z: pos.z }, gain: 0.35, rate: 1.4 });
    }
  },
};

export const pl342BleedVentPlant = pl342BleedVent;
