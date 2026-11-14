// PL-119 The red minute — "A seal flare goes red in the Graves and every cutter within
// sight stops dead for a full minute, lamps steady. Cut during the minute and every one
// of those lamps finds you."
// What the player can do: "Wait it out with them; or work a claimed wreck in the hush."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; the minute's phase is
//   hash32(seed, sector, salt) % period — no Math.random/Date.now; no Three.js/DOM.
// - All state on `this` (session-only); bounded marker ledger (tuning.memoryCap).
// - Anchors sector_eunomia_gulf / poi_eunomia_hulk (the Graves) with station_eunomia as
//   fallback — read from live entities; the module spawns its own flare prop only.
// - The "cutters hold" is a marked state plus the flare; cutting is judged from real
//   pickup/salvage receipts. The lamps-find-you reaction uses the lamp flash seam
//   (data.lampsFlashing + data.lampFlashUntil) on the cutters present.
// - The hold is player-visible: each marked cutter carries a 'HOLDING' swarmFloorPad for
//   the minute, swept when the hold expires (the pl259/pl267 chalk expiry discipline).

import { hash32 } from '../../core/rng.js';

export const PLANTS_RED_MINUTE_EVENT = 'plants:eunomiaRedMinute';

export const RED_MINUTE_TUNING = Object.freeze({
  plId: 'pl119',
  sectorId: 'sector_eunomia_gulf',
  stationId: 'station_eunomia',
  poiId: 'poi_eunomia_hulk',
  periodS: 600,            // once per sector-day the flare goes red
  minuteS: 60,
  gravesRangeWu: 700,      // the Graves' reach around the planted hulk
  cutterFlashS: 6,
  flareOffsetWu: 90,
  memoryCap: 16,           // cutters marked per minute
});

/** Pure: is `simTime` inside the red minute for a seeded phase? */
export function redMinuteWindow(simTime, phase, periodS = RED_MINUTE_TUNING.periodS, minuteS = RED_MINUTE_TUNING.minuteS) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  const m = ((t - phase) % periodS + periodS) % periodS;
  return m < minuteS;
}

/** Pure: the minute's seeded phase for a sector. */
export function redMinutePhase(seed, sectorId, salt = 'pl119-minute') {
  const h = Number.isFinite(hash32(seed, sectorId, salt)) ? hash32(seed, sectorId, salt) : 0;
  return (h % RED_MINUTE_TUNING.periodS);
}

/** Pure: a cutter is a crewed hull in the Graves that is not the player. */
export function isCutter(e, playerId) {
  return !!e && e.alive !== false && e.type === 'ship' && e.id !== playerId;
}

export const redMinutePlant = {
  name: 'plants119',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._heldPads = new Map();   // cutter id -> holdUntil (bounded by memoryCap)
    this._flareId = null;
    this._wasWindow = false;
    this._violationKey = null;
    this._playerSeenWhole = true;
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('pickup:collected', (p) => this._onWorked(p));
    on('salvage:placed', (p) => this._onWorked(p));
    on('sector:exit', () => this._cleanup());
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== RED_MINUTE_TUNING.sectorId) return;
    this._accum += dt;
    if (this._accum < 1) return;   // 1 Hz
    this._accum = 0;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    this._sweepExpiredHolds(now);
    const anchor = this._poi() || this._station();
    if (!anchor) return;
    const phase = redMinutePhase(s.meta && s.meta.seed, RED_MINUTE_TUNING.sectorId);
    const inWindow = redMinuteWindow(now, phase);
    this._ensureFlare(anchor);
    const player = s.entities && s.entities.get(s.playerId);
    const playerNear = !!(player && player.pos && this._within(player.pos, anchor.pos, RED_MINUTE_TUNING.gravesRangeWu));
    if (inWindow && !this._wasWindow) {
      const cutters = this._cutters(anchor);
      for (const c of cutters) {
        if (!c.data) c.data = {};
        c.data.plants119HoldUntil = now + RED_MINUTE_TUNING.minuteS;
        c.data.swarmFloorPad = { label: 'HOLDING' };   // the beat, visible through the pad layer
        this._heldPads.set(c.id, c.data.plants119HoldUntil);
      }
      this._playerSeenWhole = playerNear;
      this._violationKey = null;
      this._pad('RED MINUTE — HOLD');
      this.bus.emit('audio:cue', { id: 'confirm', position: anchor.pos, gain: 0.6, rate: 0.6 });
      this.bus.emit(PLANTS_RED_MINUTE_EVENT, { kind: 'holdStart', cutters: cutters.length, t: now });
    }
    if (inWindow) {
      if (!playerNear) this._playerSeenWhole = false;
    }
    if (!inWindow && this._wasWindow) {
      this._pad('SEAL FLARE');
      if (this._playerSeenWhole && playerNear) {
        this._say(`plants:pl119:done:${Math.floor(now)}`, "Minute's done. Cut clean.", 6);
        this.bus.emit(PLANTS_RED_MINUTE_EVENT, { kind: 'satItOut', t: now });
      }
    }
    this._wasWindow = inWindow;
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._cleanup();
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _poi() {
    const s = this.state;
    const list = Array.isArray(s.entityList) ? s.entityList : [];
    for (const e of list) {
      if (e && e.alive !== false && e.data && e.data.poiId === RED_MINUTE_TUNING.poiId) return e;
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.alive !== false && e.data && e.data.poiId === RED_MINUTE_TUNING.poiId) return e;
      }
    }
    return null;
  },

  _station() {
    const s = this.state;
    const idx = s.entityIndex && Array.isArray(s.entityIndex.stations) ? s.entityIndex.stations : null;
    const lists = [idx, Array.isArray(s.entityList) ? s.entityList : null];
    for (const list of lists) {
      if (!list) continue;
      for (const e of list) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === RED_MINUTE_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _within(pos, center, rangeWu) {
    if (!pos || !center) return false;
    return Math.hypot(pos.x - center.x, pos.z - center.z) <= rangeWu;
  },

  _cutters(anchor) {
    const s = this.state;
    const out = [];
    // coreSystem puts every hull in entityList AND entities: count each cutter once.
    const seenIds = new Set();
    const list = Array.isArray(s.entityList) ? s.entityList : [];
    const push = (e) => {
      if (out.length >= RED_MINUTE_TUNING.memoryCap) return;
      if (!e || e.id == null || seenIds.has(e.id)) return;
      if (isCutter(e, s.playerId) && e.pos && this._within(e.pos, anchor.pos, RED_MINUTE_TUNING.gravesRangeWu)) {
        seenIds.add(e.id);
        out.push(e);
      }
    };
    for (const e of list) push(e);
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) push(e);
    }
    return out;
  },

  /** The HOLDING pads come off when the minute expires (the pl259/pl267 chalk sweep). */
  _sweepExpiredHolds(now) {
    if (!this._heldPads || this._heldPads.size === 0) return;
    for (const [id, until] of this._heldPads) {
      if (Number.isFinite(until) && now < until) continue;
      this._heldPads.delete(id);
      const c = this.state && this.state.entities ? this.state.entities.get(id) : null;
      if (c && c.data && c.data.swarmFloorPad && c.data.swarmFloorPad.label === 'HOLDING') {
        delete c.data.swarmFloorPad;
      }
    }
  },

  _ensureFlare(anchor) {
    if (this._flareId != null) {
      const flare = this.state.entities && this.state.entities.get(this._flareId);
      if (flare && flare.alive !== false) return;
      this._flareId = null;
    }
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const h = Number.isFinite(hash32(this.state.meta && this.state.meta.seed, RED_MINUTE_TUNING.sectorId, 'pl119-flare'))
      ? hash32(this.state.meta && this.state.meta.seed, RED_MINUTE_TUNING.sectorId, 'pl119-flare') : 0;
    const bearing = (h % 6283) / 1000;
    const pos = {
      x: anchor.pos.x + Math.cos(bearing) * RED_MINUTE_TUNING.flareOffsetWu,
      z: anchor.pos.z + Math.sin(bearing) * RED_MINUTE_TUNING.flareOffsetWu,
    };
    const spawnEntity = this.helpers.spawnEntity;
    const ent = spawnEntity({
      type: 'beacon',
      pos,
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'Seal flare — the red minute',
        storyPropKind: 'seal_flare',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'SEAL FLARE' },
      },
    });
    if (ent && ent.id != null) {
      this._flareId = ent.id;
      this._ownedIds.add(ent.id);
    }
  },

  _pad(label) {
    if (this._flareId == null) return;
    const flare = this.state.entities && this.state.entities.get(this._flareId);
    if (flare && flare.data) {
      flare.data.swarmFloorPad = { label };
    }
  },

  _onWorked(p) {
    const s = this.state;
    if (!s || !p) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const phase = redMinutePhase(s.meta && s.meta.seed, RED_MINUTE_TUNING.sectorId);
    if (!redMinuteWindow(now, phase)) return;   // work outside the minute is ordinary
    const anchor = this._poi() || this._station();
    if (!anchor) return;
    const pos = p.pos || (s.entities && p.id ? (s.entities.get(p.id) || {}).pos : null) || (s.entities && s.entities.get(s.playerId) || {}).pos;
    if (!pos || !this._within(pos, anchor.pos, RED_MINUTE_TUNING.gravesRangeWu)) return;
    const key = String(Math.floor(now / RED_MINUTE_TUNING.minuteS));
    if (this._violationKey === key) return;   // one finding per minute
    this._violationKey = key;
    this._playerSeenWhole = false;
    const cutters = this._cutters(anchor);
    for (const c of cutters) {
      if (!c.data) c.data = {};
      c.data.lampsFlashing = true;
      c.data.lampFlashUntil = now + RED_MINUTE_TUNING.cutterFlashS;
    }
    this.bus.emit('audio:cue', { id: 'warning', position: anchor.pos, gain: 0.9, rate: 0.7 });
    this._say(`plants:pl119:found:${key}`, 'The lamps find you.', 6);
    this.bus.emit(PLANTS_RED_MINUTE_EVENT, { kind: 'cutting', cutters: cutters.length, t: now });
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'THE GRAVES', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'bark', id, text, ttl, key: RED_MINUTE_TUNING.plId });
    }
  },

  _cleanup() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      for (const id of this._ownedIds) removeEntity(id);
    }
    this._ownedIds = new Set();
    if (this._heldPads) {
      for (const id of this._heldPads.keys()) {
        const c = this.state && this.state.entities ? this.state.entities.get(id) : null;
        if (c && c.data && c.data.swarmFloorPad && c.data.swarmFloorPad.label === 'HOLDING') {
          delete c.data.swarmFloorPad;
        }
      }
    }
    this._heldPads = new Map();
    this._flareId = null;
    this._wasWindow = false;
    this._violationKey = null;
    this._playerSeenWhole = true;
  },
};
