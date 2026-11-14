// PL-170 The window that doesn't — "Wick lights one window per relief run, and the
// count climbs — but one window on the scar has never lit, any run."
// What the player can do: "Look, lit by your own lamps; or pass it by."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; the dark window's index is
//   hash32(seed, sector, salt) % windows; no Math.random/Date.now; no Three.js/DOM.
// - All state on `this` (session-only); windows are this module's own spawned props;
//   the lit set is bounded by the window count (tuning.memoryCap).
// - Anchors sector_ashfall_reach / poi_ashfall_burn_lamp (the scar) with
//   station_ashcache as fallback; never edits src/data.
// - "Lit by your own lamps" is the honest reading of the seam: within look range while
//   the row is lit, the dark window holds your lamplight for a few seconds via the lamp
//   flash seam, then goes back — it has never lit, any run.

import { hash32 } from '../../core/rng.js';

export const PLANTS_DARK_WINDOW_EVENT = 'plants:theWindowThatDoesnt';

export const DARK_WINDOW_TUNING = Object.freeze({
  plId: 'pl170',
  sectorId: 'sector_ashfall_reach',
  stationId: 'station_ashcache',
  poiId: 'poi_ashfall_burn_lamp',
  windows: 7,
  reliefPeriodS: 600,       // one relief run per sector-day
  spacingWu: 46,            // the scar's window row
  lookRangeWu: 110,         // your lamps reach it here
  lookLitS: 5,
  memoryCap: 8,             // the row, plus slack
});

/** Pure: which relief run is this? */
export function reliefIndex(simTime, periodS = DARK_WINDOW_TUNING.reliefPeriodS) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  return Math.floor(t / periodS);
}

/** Pure: the window that never lights. */
export function darkWindowIndex(seed, sectorId, windows = DARK_WINDOW_TUNING.windows) {
  const h = Number.isFinite(hash32(seed, sectorId, 'pl170-dark')) ? hash32(seed, sectorId, 'pl170-dark') : 0;
  return h % windows;
}

/** Pure: the lit order — Wick lights along the row, skipping the dark one forever. */
export function litOrder(windows, darkIdx) {
  const order = [];
  for (let i = 0; i < windows; i++) {
    if (i !== darkIdx) order.push(i);
  }
  return order;
}

export const theWindowThatDoesntPlant = {
  name: 'plants170',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._windowIds = [];
    this._litCount = 0;
    this._lastRelief = -1;
    this._lookDone = false;
    this._lookLitUntil = 0;
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => { this._lookDone = false; this._lookLitUntil = 0; });
    // game:newGame: the window row's ids survive every sector:exit by design, so without
    // this drop the row never respawns in the new game and _lightNext stamps lamps/pads
    // on live entities holding reused ids. The removals no-op — entities are already gone.
    on('game:newGame', () => this._despawnOwned());
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== DARK_WINDOW_TUNING.sectorId) return;
    const anchor = this._poi() || this._station();
    if (!anchor) return;
    this._accum += dt;
    if (this._accum < 1) return;   // 1 Hz — relief runs are slow
    this._accum = 0;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    this._ensureRow(anchor);
    const player = s.entities && s.entities.get(s.playerId);

    // Wick lights one window per relief run, and the count climbs.
    const r = reliefIndex(now);
    if (r > this._lastRelief && this._lastRelief >= 0) {
      this._lastRelief = r;
      this._lightNext(anchor, now);
    } else if (this._lastRelief < 0) {
      this._lastRelief = r;
    }

    // the dark one: lit by your own lamps, briefly, then never again this visit
    if (!this._lookDone && player && player.pos) {
      const darkIdx = darkWindowIndex(s.meta && s.meta.seed, DARK_WINDOW_TUNING.sectorId);
      const darkId = this._windowIds[darkIdx];
      const dark = darkId != null ? s.entities.get(darkId) : null;
      const anyLit = this._litCount > 0;
      if (dark && anyLit) {
        const d = Math.hypot(player.pos.x - dark.pos.x, player.pos.z - dark.pos.z);
        if (d <= DARK_WINDOW_TUNING.lookRangeWu) {
          this._lookDone = true;
          this._lookLitUntil = now + DARK_WINDOW_TUNING.lookLitS;
          dark.data.lampsFlashing = true;
          dark.data.lampFlashUntil = this._lookLitUntil;
          dark.data.swarmFloorPad = { label: 'YOUR LAMPS LIT IT' };
          this._say(`plants:pl170:look:${Math.floor(now)}`, 'Lit by yours. Then dark.', 6);
          this.bus.emit('audio:cue', { id: 'confirm', position: dark.pos, gain: 0.6, rate: 1.1 });
          this.bus.emit(PLANTS_DARK_WINDOW_EVENT, { kind: 'litByYourLamps', windowIdx: darkIdx, t: now });
        }
      }
    }
    if (this._lookLitUntil > 0 && now >= this._lookLitUntil) {
      this._lookLitUntil = 0;
      const darkIdx = darkWindowIndex(s.meta && s.meta.seed, DARK_WINDOW_TUNING.sectorId);
      const darkId = this._windowIds[darkIdx];
      const dark = darkId != null ? s.entities.get(darkId) : null;
      if (dark && dark.data) {
        dark.data.lampsFlashing = false;
        dark.data.swarmFloorPad = { label: `WINDOW ${darkIdx + 1}` };
      }
    }
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._despawnOwned();
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _poi() {
    const s = this.state;
    const list = Array.isArray(s.entityList) ? s.entityList : [];
    for (const e of list) {
      if (e && e.alive !== false && e.data && e.data.poiId === DARK_WINDOW_TUNING.poiId) return e;
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.alive !== false && e.data && e.data.poiId === DARK_WINDOW_TUNING.poiId) return e;
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
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === DARK_WINDOW_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _ensureRow(anchor) {
    if (this._windowIds.length > 0) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const s = this.state;
    const h = Number.isFinite(hash32(s.meta && s.meta.seed, DARK_WINDOW_TUNING.sectorId, 'pl170-row'))
      ? hash32(s.meta && s.meta.seed, DARK_WINDOW_TUNING.sectorId, 'pl170-row') : 0;
    const bearing = (h % 6283) / 1000;
    const ux = Math.cos(bearing);
    const uz = Math.sin(bearing);
    const span = (DARK_WINDOW_TUNING.windows - 1) * DARK_WINDOW_TUNING.spacingWu;
    for (let i = 0; i < DARK_WINDOW_TUNING.windows; i++) {
      const off = -span / 2 + i * DARK_WINDOW_TUNING.spacingWu;
      const ent = this._spawn({
        type: 'beacon',
        pos: { x: anchor.pos.x + ux * off, z: anchor.pos.z + uz * off },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          scanLabel: 'A window on the scar — one has never lit, any run',
          storyPropKind: 'scar_window',
          tetherable: true,
          masslineTetherable: true,
          swarmFloorPad: { label: `WINDOW ${i + 1}` },
        },
      });
      if (ent) this._windowIds.push(ent.id);
    }
  },

  _lightNext(anchor, now) {
    const s = this.state;
    const darkIdx = darkWindowIndex(s.meta && s.meta.seed, DARK_WINDOW_TUNING.sectorId);
    const order = litOrder(DARK_WINDOW_TUNING.windows, darkIdx);
    if (this._litCount >= order.length) return;
    const idx = order[this._litCount];
    const winId = this._windowIds[idx];
    const win = winId != null ? s.entities.get(winId) : null;
    if (!win || !win.data) return;
    this._litCount += 1;
    win.data.lampsFlashing = true;
    win.data.lampFlashUntil = now + DARK_WINDOW_TUNING.lookLitS * 6;   // Wick's light holds
    win.data.swarmFloorPad = { label: `WINDOW ${idx + 1} · LIT` };
    this.bus.emit('audio:cue', { id: 'sfx_vent_chime', position: win.pos, gain: 0.35, rate: 1.3 });
    this.bus.emit(PLANTS_DARK_WINDOW_EVENT, { kind: 'reliefLit', count: this._litCount, windowIdx: idx, t: now });
  },

  _spawn(spec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const data = spec.data || {};
    spec.data = {
      ...data,
      plants: { ...(data.plants || {}), [DARK_WINDOW_TUNING.plId]: { role: 'window' } },
    };
    const ent = spawnEntity(spec);
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent || null;
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'THE SCAR', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'info', id, text, ttl, key: DARK_WINDOW_TUNING.plId });
    }
  },

  _despawnOwned() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity !== 'function') return;
    for (const id of this._ownedIds) removeEntity(id);
    this._ownedIds = new Set();
    this._windowIds = [];
    this._litCount = 0;
    this._lastRelief = -1;
  },
};
