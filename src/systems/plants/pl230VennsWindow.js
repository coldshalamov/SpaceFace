// PL-230 Venn's window — "At Lamps-Up, Orla Venn's window is the first lit and the last
// dark. Park outside it and the whole crescent comes up in front of you | Be the audience
// of one"
//
// SEAM NOTE (honest): the crescent is a fixed arc of habitat windows off the live
// station_helios body in sector_helios_prime (src/data/sectors.js:63); Orla Venn's window
// sits at its centre. Lamps-Up is the start of the night band on the shared 240 s plant day
// (the same clock family as the shipped PL-146/PL-153 plants — no canonical calendar lamp
// ceremony exists in code, so the plant owns the honest fixed clock). At Lamps-Up the
// windows come up in sequence with Venn's FIRST; at lamps-down they go dark in sequence
// with Venn's LAST. Park outside Venn's window while it is lit and the rest of the crescent
// comes up in front of you, once per lamps-up — the audience of one.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM. Lit/dark are data stamps the street layer reads.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the crescent,
//   clears session state (tuning.memoryCap).
// - The ordering contract is exact: Venn first lit, Venn last dark, every in-world day.

import { hash32 } from '../../core/rng.js';

export const PL_230_LAMPS_UP_EVENT = 'plants:pl230:lampsUp';
export const PL_230_LAMPS_DOWN_EVENT = 'plants:pl230:lampsDown';
export const PL_230_AUDIENCE_EVENT = 'plants:pl230:audience';

export const VENNS_WINDOW_TUNING = Object.freeze({
  sectorId: 'sector_helios_prime',
  stationId: 'station_helios',
  crescentCount: 6,
  crescentSpacingWu: 52,
  crescentOffsetWu: 300,
  arcBendWu: 60,
  bearingSalt: 'plantsPl230Crescent',
  vennIndex: -1,              // -1 resolves to the crescent's centre via hash below
  dayLengthS: 240,
  nightFraction: 0.25,        // Lamps-Up opens the night band (phase >= 180)
  lampStaggerS: 2.2,          // one window at a time
  parkRadiusWu: 42,
  parkGateSpeed: 5,
  parkNeedS: 2,
  windowRadius: 7,
  memoryCap: 6,
});

export const VENN_SALT = 'plantsPl230Venn';

/** Fixed crescent layout off the live station body. */
export function crescentFor(origin, t = VENNS_WINDOW_TUNING) {
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const dir = { x: Math.cos(bearing), z: Math.sin(bearing) };
  const perp = { x: -dir.z, z: dir.x };
  const windows = [];
  for (let i = 0; i < t.crescentCount; i += 1) {
    const u = i - (t.crescentCount - 1) / 2;   // -2.5 .. +2.5 for six windows
    const along = t.crescentOffsetWu + u * t.crescentSpacingWu;
    const bend = u * u * t.arcBendWu / Math.max(1, (t.crescentCount - 1) / 2);
    windows.push({
      x: origin.x + dir.x * along - perp.x * bend,
      z: origin.z + dir.z * along - perp.z * bend,
    });
  }
  return windows;
}

/** Venn's window is the crescent's centre. */
export function vennIndexFor(t = VENNS_WINDOW_TUNING) {
  if (t.vennIndex >= 0) return t.vennIndex;
  return Math.floor(t.crescentCount / 2);
}

/** Lamps-Up: the phase boundary into the night band. */
export function isLampsUpBand(simTime, t = VENNS_WINDOW_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  return phase >= len * (1 - t.nightFraction);
}

function stationOf(state, stationId) {
  if (!state) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  const pools = [];
  if (list.length) pools.push(list);
  if (state.entities && typeof state.entities.values === 'function') pools.push([...state.entities.values()]);
  for (const pool of pools) {
    for (const e of pool) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      if (((e.data && e.data.stationId) || e.id) === stationId) return e;
    }
  }
  return null;
}

export function createPl230VennsWindow() {
  return {
    name: 'plantsPl230',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._windowIds = [];
      this._litBandSeen = null;   // day-band index already handled
      this._pendingLit = [];      // [{ id, at }] staggered lamps-up queue
      this._pendingDark = [];
      this._audienceDoneBand = null;
      this._parkSince = null;
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
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      this._drop();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of this._windowIds || []) rm(id);
      }
      this._windowIds = [];
      this._litBandSeen = null;
      this._pendingLit = [];
      this._pendingDark = [];
      this._audienceDoneBand = null;
      this._parkSince = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _window(index) {
      const id = this._windowIds[index];
      return id != null && this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _ensure(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._windowIds.length) return;
      const t = VENNS_WINDOW_TUNING;
      const venn = vennIndexFor(t);
      crescentFor(origin, t).forEach((pos, i) => {
        const isVenn = i === venn;
        const ent = spawn({
          type: 'beacon',
          pos: { x: pos.x, z: pos.z },
          vel: { x: 0, z: 0 },
          radius: t.windowRadius,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_crescent_window',
            plantsPl230Window: true,
            plantsPl230Venn: isVenn === true,
            placeId: 'place_habitat_pod',
            everydaySpaceKit: true,
            scanLabel: isVenn ? 'Orla Venn\u2019s window — first lit, last dark' : 'A window on the crescent',
            swarmFloorPad: { label: isVenn ? 'Venn\u2019s window' : 'Window' },
            lampsFlashing: false,
            plantsPl230Lit: false,
          },
        });
        this._windowIds.push(ent && ent.id != null ? ent.id : null);
      });
    },

    _setLit(index, lit, now) {
      const w = this._window(index);
      if (!w?.data) return;
      w.data.plantsPl230Lit = lit;
      w.data.lampsFlashing = lit;
      if (lit) {
        w.data.lampFlashUntil = now + 1.5; // a lamp coming up flashes once, then burns steady
        w.data.litAt = now;
      } else {
        w.data.lampFlashUntil = now;
        w.data.darkAt = now;
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== VENNS_WINDOW_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, VENNS_WINDOW_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const t = VENNS_WINDOW_TUNING;
      const now = this._now();
      this._ensure(station.pos);
      const venn = vennIndexFor(t);

      // Walk the staggered queues: lamps come up one window at a time, and go dark the
      // same way — Venn first up, Venn last down, whatever else happens.
      for (let i = this._pendingLit.length - 1; i >= 0; i -= 1) {
        if (now >= this._pendingLit[i].at) {
          this._setLit(this._pendingLit[i].index, true, now);
          this._pendingLit.splice(i, 1);
        }
      }
      for (let i = this._pendingDark.length - 1; i >= 0; i -= 1) {
        if (now >= this._pendingDark[i].at) {
          this._setLit(this._pendingDark[i].index, false, now);
          this._pendingDark.splice(i, 1);
        }
      }

      // Day-band boundaries: only true transitions into and out of the night band fire.
      const litBand = isLampsUpBand(now, t);
      if (this._litBandSeen === null) {
        // First look in this visit: take the band's state, plan no ceremony, no event.
        this._litBandSeen = litBand;
      } else if (this._litBandSeen !== litBand) {
        this._litBandSeen = litBand;
        this._pendingLit = [];
        this._pendingDark = [];
        if (litBand) {
          // Lamps-Up: Venn first, then the crescent out from her.
          const order = [venn,
            ...Array.from({ length: t.crescentCount }, (_, i) => i).filter((i) => i !== venn)];
          order.forEach((index, rank) => {
            this._pendingLit.push({ index, at: now + rank * t.lampStaggerS });
          });
          this._audienceDoneBand = null;
          this.bus?.emit(PL_230_LAMPS_UP_EVENT, { first: venn, t: now });
        } else {
          // Lamps-down: the crescent goes dark, Venn LAST.
          const order = Array.from({ length: t.crescentCount }, (_, i) => i)
            .filter((i) => i !== venn).concat([venn]);
          order.forEach((index, rank) => {
            this._pendingDark.push({ index, at: now + rank * t.lampStaggerS });
          });
          this.bus?.emit(PL_230_LAMPS_DOWN_EVENT, { last: venn, t: now });
        }
      }
      const bandKey = `${Math.floor(now / Math.max(1, t.dayLengthS))}:${litBand ? 'up' : 'down'}`;

      const vennWindow = this._window(venn);
      if (!vennWindow?.pos) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const d = Math.hypot(player.pos.x - vennWindow.pos.x, player.pos.z - vennWindow.pos.z);
      const lit = vennWindow.data?.plantsPl230Lit === true;
      // Park outside Venn's lit window: the whole crescent comes up in front of you, once.
      if (lit && d <= t.parkRadiusWu
        && Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0) <= t.parkGateSpeed) {
        if (this._parkSince == null) this._parkSince = now;
        else if (this._audienceDoneBand !== bandKey && now - this._parkSince >= t.parkNeedS) {
          this._audienceDoneBand = bandKey;
          this._parkSince = null;
          this._pendingLit = this._pendingLit.filter((p) => {
            if (p.index === venn) return false;
            this._setLit(p.index, true, now);
            return false;
          });
          this.bus?.emit('audio:cue', { id: 'confirm' });
          this.bus?.emit(PL_230_AUDIENCE_EVENT, { crescent: t.crescentCount, t: now });
        }
      } else if (d > t.parkRadiusWu) {
        this._parkSince = null;
      }
    },
  };
}

export const pl230VennsWindow = createPl230VennsWindow();
