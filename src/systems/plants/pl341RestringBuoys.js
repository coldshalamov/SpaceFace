// PL-341 Nereid Shoal — "The re-strung buoys. The Shoal's marker buoys are re-strung before dawn
// by a volunteer. Snag a loose one and they will re-string YOUR hull's markers too, free | Leave
// theirs be; or cut a marker for parts — your hull gets no re-string, ever, in that water |
// DRAFT 2026-11-13"
//
// SEAM NOTE (honest): the Shoal is sector_nereid_shoal / station_nereid (verified in
// src/data/frontierRegions/east.js). The markers exist only in the row, so they are MARKER_COUNT
// story-prop buoys around the shoal, strung (masslineTetherable + lamps on) and re-strung before
// every dawn (MERCY_DAY_S): each dawn one marker — hashed by day — hangs loose (lamp dark) for a
// passer-by to snag. Snagging is physical: drift into the loose marker's ring at snag pace. Cut a
// marker for parts is physical too: shear a STRUNG marker — through its cut ring above cut pace —
// and the marker goes dark; your hull is remembered in that water (session-long, cleared only by
// game reset, which is the honest scope of "ever" here) and gets no re-string, ever.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned markers (RESET not
//   unsubscribe). Bounded ledgers (tuning.memoryCap); per-dawn restring, per-hull bite.
// - The volunteer's courtesy is a stamp + lamp flag on the snagging hull — no invented systems.

import { hash32 } from '../../core/rng.js';

export const PL_341_RESTRUNG_EVENT = 'plants:pl341:restrung';
export const PL_341_MARKER_GIFT_EVENT = 'plants:pl341:markerGift';
export const PL_341_CUT_EVENT = 'plants:pl341:cut';

export const VOLUNTEER_SENDER = 'THE SHOAL VOLUNTEER';
export const STRUNG_LINE = 'Strung. Yours too — no charge.';
export const CUT_LINE = 'No re-string. Not ever.';

export const RESTRING_TUNING = Object.freeze({
  plId: 'pl341',
  sectorId: 'sector_nereid_shoal',
  stationId: 'station_nereid',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  markerCount: 6,
  ringRadiusWu: 420,
  snagRadiusWu: 40,
  snagSpeedWu: 12,
  cutRadiusWu: 26,
  cutSpeedWu: 70,            // shearing a strung marker at pace cuts it for parts
  markerHull: 8,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: which marker hangs loose on `day` (the volunteer re-strings the rest before dawn). */
export function looseMarkerFor(dayIndex, count, tuning = RESTRING_TUNING) {
  const day = Math.floor(finite(dayIndex));
  const n = Math.max(1, Math.floor(count));
  return hash32('plantsPl341loose', day) % n;
}

/** Pure: the marker ring's positions around the shoal station. */
export function markerPositions(stationPos, tuning = RESTRING_TUNING) {
  const h = hash32('plantsPl341ring', tuning.sectorId);
  const base = (h % 3600) / 3600 * Math.PI * 2;
  const out = [];
  for (let i = 0; i < tuning.markerCount; i++) {
    const ang = base + (i / tuning.markerCount) * Math.PI * 2;
    out.push({
      x: finite(stationPos?.x) + Math.cos(ang) * tuning.ringRadiusWu,
      z: finite(stationPos?.z) + Math.sin(ang) * tuning.ringRadiusWu,
    });
  }
  return out;
}

/** Pure: has this hull cut a marker in that water (session-long)? */
export function hasCutMarker(cutHulls, hullKey) {
  return cutHulls?.has?.(String(hullKey)) === true;
}

export const pl341RestringBuoys = {
  modes: ['flight'],
  name: 'plantsPl341',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._markerIds = [];
    this._strungDay = -1;
    this._cutHulls = new Map();     // hullKey -> simTime cut at (bounded, session-long memory)
    this._toldCutAt = new Map();
    this._giftDay = new Map();      // hullKey -> day of last free re-string (bounded)
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
    this._cutHulls.clear();
    this._toldCutAt.clear();
    this._giftDay.clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._cutHulls.clear();
    this._toldCutAt.clear();
    this._giftDay.clear();
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function') {
      for (const id of this._markerIds) rm(id);
    }
    this._markerIds = [];
    this._strungDay = -1;
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
      if (data.stationId === RESTRING_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureMarkers(s, now, day, positions) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || positions == null) return;
    if (this._markerIds.length !== RESTRING_TUNING.markerCount) {
      const loose = looseMarkerFor(day, RESTRING_TUNING.markerCount);
      for (let i = 0; i < RESTRING_TUNING.markerCount; i++) {
        const isLoose = i === loose;
        const ent = spawn({
          type: 'beacon',
          pos: positions[i],
          vel: { x: 0, z: 0 },
          radius: 4,
          mass: 1e6,
          hull: RESTRING_TUNING.markerHull,
          hullMax: RESTRING_TUNING.markerHull,
          homeSectorId: RESTRING_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            scanLabel: isLoose ? 'A loose marker — snag it and the volunteer strings it' : 'A strung marker',
            storyPropKind: 'shoal_marker_buoy',
            plantsPl341Marker: i,
            plantsPl341Strung: !isLoose,
            lampsFlashing: !isLoose,
            lampFlashUntil: now + 1,
            masslineTetherable: !isLoose,
            swarmFloorPad: { label: isLoose ? 'LOOSE MARKER' : 'STRUNG MARKER' },
            homeSectorId: RESTRING_TUNING.sectorId,
          },
        });
        if (ent && ent.id != null) this._markerIds.push(ent.id);
      }
      this._strungDay = day;
    } else if (this._strungDay !== day) {
      // Re-strung before dawn by the volunteer.
      const loose = looseMarkerFor(day, RESTRING_TUNING.markerCount);
      for (let i = 0; i < this._markerIds.length; i++) {
        const e = s.entities?.get?.(this._markerIds[i]);
        if (!e?.data) continue;
        const isLoose = i === loose;
        e.data.plantsPl341Strung = !isLoose;
        e.data.lampsFlashing = !isLoose;
        e.data.lampFlashUntil = now + 1;
        e.data.masslineTetherable = !isLoose;
        e.data.scanLabel = isLoose ? 'A loose marker — snag it and the volunteer strings it' : 'A strung marker';
      }
      this._strungDay = day;
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
    if (s.world?.currentSectorId !== RESTRING_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = RESTRING_TUNING;
    const day = Math.floor(now / t.MERCY_DAY_S);
    const positions = markerPositions(station.pos, t);
    this._ensureMarkers(s, now, day, positions);

    const hullKey = this._hullKey(s, player);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const cutEver = hasCutMarker(this._cutHulls, hullKey);

    for (const id of this._markerIds) {
      const e = s.entities?.get?.(id);
      if (!e || e.alive === false || !e.data || !e.pos) continue;
      const d = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
      if (e.data.plantsPl341Strung === true) {
        // Cut a marker for parts: shear a strung marker at pace.
        if (d <= t.cutRadiusWu && speed >= t.cutSpeedWu) {
          e.data.plantsPl341Strung = false;
          e.data.lampsFlashing = false;
          e.data.lampFlashUntil = now;
          e.data.masslineTetherable = false;
          e.data.scanLabel = 'A cut marker — strung for parts by somebody';
          this._cutHulls.set(hullKey, now);
          if (this._cutHulls.size > t.memoryCap) this._cutHulls.delete(this._cutHulls.keys().next().value);
          const sd = station.data || (station.data = {});
          sd.plantsPl341CutBy = hullKey;      // remembered in that water
          const last = this._toldCutAt.get(hullKey) ?? -Infinity;
          if (now - last >= t.MERCY_DAY_S) {
            this._toldCutAt.set(hullKey, now);
            this.bus?.emit(PL_341_CUT_EVENT, { hullKey, markerId: id, t: now });
            this._voice('plants:pl341:cut', CUT_LINE, 5);
            this._popup('plants:pl341:cut', VOLUNTEER_SENDER, CUT_LINE, 6);
            this.bus?.emit('audio:cue', { id: 'warning', position: { x: e.pos.x, z: e.pos.z }, gain: 0.5, rate: 0.9 });
          }
        }
      } else if (!cutEver && d <= t.snagRadiusWu && speed <= t.snagSpeedWu) {
        // Snag a loose one: the volunteer strings it — and YOUR hull's markers too, free.
        e.data.plantsPl341Strung = true;
        e.data.lampsFlashing = true;
        e.data.lampFlashUntil = now + 1;
        e.data.masslineTetherable = true;
        e.data.scanLabel = 'A strung marker';
        this.bus?.emit(PL_341_RESTRUNG_EVENT, { hullKey, markerId: id, day, t: now });
        if (this._giftDay.get(hullKey) !== day) {
          this._giftDay.set(hullKey, day);
          if (this._giftDay.size > t.memoryCap) this._giftDay.delete(this._giftDay.keys().next().value);
          player.data = player.data || {};
          player.data.plantsPl341StrungUntil = (day + 1) * t.MERCY_DAY_S;  // your markers, re-strung
          this.bus?.emit(PL_341_MARKER_GIFT_EVENT, { hullKey, strungUntil: player.data.plantsPl341StrungUntil, t: now });
          this._voice('plants:pl341:gift', STRUNG_LINE, 5);
          this._popup('plants:pl341:gift', VOLUNTEER_SENDER, STRUNG_LINE, 6);
          this.bus?.emit('audio:cue', { id: 'confirm', position: { x: e.pos.x, z: e.pos.z }, gain: 0.5, rate: 1 });
        }
      }
    }
  },
};

export const pl341RestringBuoysPlant = pl341RestringBuoys;
