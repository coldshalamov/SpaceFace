// PL-360 The rain check — "A station you once saved keeps your docking comped for a year —
// the chalk is on the board beside the toll, your name on it."
// What the player can do: Use the chalk; or sell it to another hull — the board keeps the
// comp, adds a fine, and your name stays up there anyway.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random/Date.now; no Three.js/DOM.
// - "A station you once saved" is a real hostile killed within sight of the station (the
//   applause-plant sight rule, reusing its exported station scan); the comp is a station
//   stamp plantsPl360CompUntil plus the visible chalk prop with the player's name on it.
// - "Sell it to another hull": HONEST LIMIT — there is no comp-transfer UI, so the row's
//   wrong choice maps to its physical verb: waving a towed stranger in on your chalk
//   (releasing a towed living stranger inside the comped dock ring). The board keeps the
//   comp... no: the row is explicit — the board KEEPS the comp (your docking stays comped),
//   ADDS a fine (stamp plantsPl360FineUntil other writers may read; credits stay economy's
//   single writer), and the chalk with your name stays up. Refusal lamps on the next docks
//   while the fine is hot. Documented substitute, not a fake.
// - Bounded Maps with tuning.memoryCap; per-station save cooldown; RESET on sector:exit /
//   save:loaded / game:new / game:newGame; destroy() unsubscribes + despawns owned.

import { findStationsInSight } from '../applausePlant.js';
import { attachTowWatch, towTargetIdOf } from './towWatch.js';

export const PLANTS_COMP_EVENT = 'plants:pl360:comp';
export const PLANTS_FINE_EVENT = 'plants:pl360:fine';

export const RAIN_CHECK_TUNING = Object.freeze({
  plId: 'pl360',
  yearS: 900,                // comped for a year (table clock)
  saveSightWu: 1500,
  saveCooldownS: 120,
  fineS: 900,                // the added fine rides this long
  dockRadiusFallbackWu: 90,
  memoryCap: 8,
});

export const PL_360_COMP_STAMP = 'plantsPl360CompUntil';
export const PL_360_FINE_STAMP = 'plantsPl360FineUntil';

function finite(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

export function createPl360RainCheck() {
  return {
    name: 'plantsPl360',

    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._memory = new Map();
      this._lastSaveAt = new Map();    // stationId -> simTime
      this._tow = null;
      this._chalkId = null;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('entity:killed', (p = {}) => this._onKilled(p));
      on('dock:range', (p = {}) => this._onDockRange(p || {}));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:new', () => this._reset());
      on('game:newGame', () => this._reset());
      this._pl360TowInstalled = false; // re-arm per init: the flag is host-lifetime, the bus is not
      attachTowWatch(this, 'pl360', () => this._memory);
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
      this.state = null;
      this.bus = null;
    },

    _reset() {
      const rm = this.helpers && this.helpers.removeEntity;
      if (this._chalkId != null && typeof rm === 'function') rm(this._chalkId);
      this._chalkId = null;
      if (this._memory) this._memory.clear();
      if (this._lastSaveAt) this._lastSaveAt.clear();
      this._tow = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _callsign() {
      const s = this.state;
      const player = s && s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      const cs = player && player.data && (player.data.callsign || player.data.name);
      return cs ? String(cs) : 'REGULAR';
    },

    _onKilled(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const pos = p.pos || (p.id != null && s.entities && s.entities.get ? (s.entities.get(p.id) || {}).pos : null);
      if (!pos) return;
      // Was it hostile? The victim's own flags say so.
      const victim = p.id != null && s.entities && s.entities.get ? s.entities.get(p.id) : null;
      const vd = (victim && victim.data) || {};
      const hostile = vd.ai?.hostile === true || vd.isHostile === true || victim?.team === 1;
      if (!hostile) return;
      const now = this._now();
      const nearby = findStationsInSight(s, pos, RAIN_CHECK_TUNING.saveSightWu);
      for (const { station } of nearby) {
        const stationId = (station.data && station.data.stationId) || station.id;
        const last = this._lastSaveAt.get(stationId) || -Infinity;
        if (now - last < RAIN_CHECK_TUNING.saveCooldownS) continue;
        while (this._lastSaveAt.size >= RAIN_CHECK_TUNING.memoryCap) this._lastSaveAt.delete(this._lastSaveAt.keys().next().value);
        this._lastSaveAt.set(stationId, now);
        const d = station.data || (station.data = {});
        d[PL_360_COMP_STAMP] = now + RAIN_CHECK_TUNING.yearS;
        this._spawnChalk(station, now);
        const id = `plants:pl360:saved:${stationId}:${Math.round(now)}`;
        this.bus.emit('comms:popup', { id, sender: 'THE BOARD', category: 'traffic', text: 'Station saved. Docking comped. Name\u2019s on the board.', ttl: 8, persist: false });
        this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.5, rate: 1.0 });
        this.bus.emit(PLANTS_COMP_EVENT, { kind: 'saved', stationId, until: d[PL_360_COMP_STAMP], t: now });
      }
    },

    update() {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const target = towTargetIdOf(s, this._memory, now);
      if (target != null && target !== s.playerId) {
        const e = s.entities && s.entities.get ? s.entities.get(target) : null;
        if (e && e.type === 'ship' && e.alive !== false) {
          if (!this._tow || this._tow.targetId !== target) this._tow = { targetId: target, since: now };
        } else {
          this._tow = null;
        }
      } else if (this._tow) {
        // Released: if inside a comped dock ring, that was selling the chalk.
        const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
        const towed = s.entities && s.entities.get ? s.entities.get(this._tow.targetId) : null;
        if (player && player.pos && towed && towed.alive !== false && towed.pos) {
          const near = findStationsInSight(s, towed.pos, 400);
          for (const { station } of near) {
            const d = station.data || {};
            const r = Number.isFinite(d.dockRadius) && d.dockRadius > 0 ? d.dockRadius : RAIN_CHECK_TUNING.dockRadiusFallbackWu;
            const dd = Math.hypot(towed.pos.x - station.pos.x, towed.pos.z - station.pos.z);
            if (dd > r) continue;
            const compUntil = d[PL_360_COMP_STAMP];
            if (!(Number.isFinite(compUntil) && compUntil > now)) continue;
            d[PL_360_FINE_STAMP] = now + RAIN_CHECK_TUNING.fineS;
            const id = `plants:pl360:fine:${Math.round(now)}`;
            this.bus.emit('comms:popup', { id, sender: 'THE BOARD', category: 'traffic', text: 'Sold the chalk? Fine added. Name stays up.', ttl: 8, persist: false });
            this.bus.emit('audio:cue', { id: 'ui_deny', position: null, gain: 0.5, rate: 0.9 });
            this.bus.emit(PLANTS_FINE_EVENT, { kind: 'sold', stationId: (station.data && station.data.stationId) || station.id, until: d[PL_360_FINE_STAMP], t: now });
            break;
          }
        }
        this._tow = null;
      }
    },

    _onDockRange(p) {
      const s = this.state;
      if (!s || s.mode !== 'flight') return;
      if (!p || p.shipId == null || p.shipId !== s.playerId || !p.inRange || !p.stationId) return;
      const now = this._now();
      const station = this._stationById(p.stationId);
      if (!station || !station.data) return;
      const fineUntil = station.data[PL_360_FINE_STAMP];
      if (Number.isFinite(fineUntil) && fineUntil > now) {
        station.data.dockLampsFlashing = true;
        station.data.dockLampFlashUntil = now + 0.6;
        const id = `plants:pl360:finedock:${p.stationId}:${Math.round(now)}`;
        this.bus.emit('comms:popup', { id, sender: 'THE BOARD', category: 'traffic', text: 'Docking under the fine. Your chalk stays up.', ttl: 6, persist: false });
        this.bus.emit(PLANTS_FINE_EVENT, { kind: 'docked_fined', stationId: p.stationId, t: now });
        return;
      }
      const compUntil = station.data[PL_360_COMP_STAMP];
      if (Number.isFinite(compUntil) && compUntil > now) {
        const id = `plants:pl360:used:${p.stationId}:${Math.round(now)}`;
        this.bus.emit('comms:popup', { id, sender: 'THE BOARD', category: 'traffic', text: 'The chalk stands. Your docking is comped.', ttl: 6, persist: false });
        this.bus.emit(PLANTS_COMP_EVENT, { kind: 'used', stationId: p.stationId, until: compUntil, t: now });
      }
    },

    _spawnChalk(station, now) {
      const spawnEntity = this.helpers && this.helpers.spawnEntity;
      if (typeof spawnEntity !== 'function' || !station.pos) return;
      const d = station.data || {};
      const r = Number.isFinite(d.dockRadius) && d.dockRadius > 0 ? d.dockRadius : RAIN_CHECK_TUNING.dockRadiusFallbackWu;
      const who = this._callsign();
      // One chalk per hull: retire the previous board before hanging a new one, and stamp
      // homeSectorId so the world's own sector teardown can catch it if we don't.
      const rm = this.helpers && (this.helpers.removeEntity || this.helpers.despawnEntity);
      if (this._chalkId != null && typeof rm === 'function') rm(this._chalkId);
      this._chalkId = null;
      const sectorId = d.homeSectorId || d.sectorId || this.state?.world?.currentSectorId;
      const ent = spawnEntity({
        type: 'beacon',
        pos: { x: station.pos.x - (r + 10), z: station.pos.z - 10 },
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_pl360_chalk',
          plantsPl360Chalk: true,
          homeSectorId: sectorId,
          scanLabel: `The board beside the toll: DOCKING COMPED — ${who}`,
          swarmFloorPad: { label: 'COMPED — YOURS' },
          masslineTetherable: true,
        },
      });
      if (ent && ent.id != null) this._chalkId = ent.id;
    },

    _stationById(stationId) {
      const s = this.state;
      const idx = s && s.entityIndex;
      const list = (idx && Array.isArray(idx.stations)) ? idx.stations
        : (s && Array.isArray(s.entityList) ? s.entityList : []);
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station') continue;
        const sid = (st.data && st.data.stationId) || st.id;
        if (sid === stationId) return st;
      }
      return null;
    },
  };
}

export const pl360RainCheck = createPl360RainCheck();
